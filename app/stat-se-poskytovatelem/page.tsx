'use client'
// app/stat-se-poskytovatelem/page.tsx
//
// Přechod ZÁKAZNÍK → POSKYTOVATEL ve dvou krocích:
//   1) zadá IČO → podíváme se do ARES (nic neukládáme)
//   2) uvidí, KOHO ARES našel, a musí potvrdit, že je to on
//
// Proč dva kroky: překlep v jedné číslici by ho nechal vystupovat pod cizí
// firmou. A výslovné prohlášení „jsem oprávněn za tento subjekt jednat" je
// zároveň doklad, že případné zneužití cizího IČO nebylo omylem.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Loader2, AlertCircle, CheckCircle2, ShieldCheck, BadgeCheck,
  ArrowLeft, Wallet, Eye, Building2, MapPin, ArrowRight,
} from 'lucide-react'
import { lookupIco, becomeProvider } from '@/lib/actions/become-provider'

type Subject = { companyName: string; address?: string | null; legalForm?: string | null; since?: string | null }

export default function StatSePoskytovatelemPage() {
  const router = useRouter()
  const [step, setStep] = useState<1 | 2>(1)
  const [ico, setIco] = useState('')
  const [phone, setPhone] = useState('')
  const [subject, setSubject] = useState<Subject | null>(null)
  const [agree, setAgree] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<{ companyName?: string } | null>(null)

  // ── KROK 1: najít v ARES ──
  const search = async () => {
    setError('')
    const clean = ico.replace(/\s/g, '')
    if (!/^\d{8}$/.test(clean)) { setError('IČO musí mít 8 číslic.'); return }

    setLoading(true)
    const res: any = await lookupIco(clean)
    setLoading(false)
    if (!res.success) { setError(res.error); return }

    setSubject(res.subject)
    setAgree(false)
    setStep(2)
  }

  // ── KROK 2: potvrdit a uložit ──
  const confirm = async () => {
    setError('')
    if (!agree) { setError('Potvrďte prosím, že údaje patří vám.'); return }

    setLoading(true)
    const res: any = await becomeProvider({
      ico: ico.replace(/\s/g, ''),
      phone: phone.trim() || undefined,
      confirmed: true,
    })
    if (!res.success) { setError(res.error); setLoading(false); return }

    setDone({ companyName: res.companyName })
    setTimeout(() => { router.push('/pridat-sluzbu'); router.refresh() }, 1800)
  }

  // ── Hotovo ──
  if (done) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md rounded-2xl border border-emerald-200 bg-white p-10 text-center shadow-sm"
        >
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
          </div>
          <h1 className="mb-2 text-2xl font-black text-slate-900">Hotovo!</h1>
          <p className="text-slate-500">
            {done.companyName
              ? <>Ověřili jsme <strong className="text-slate-700">{done.companyName}</strong> v registru ARES. Teď si přidejte první nabídku.</>
              : <>Váš účet je připravený. Teď si přidejte první nabídku.</>}
          </p>
          <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-slate-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Přesměrováváme…
          </p>
        </motion.div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12">
      <div className="mx-auto max-w-md">
        <Link href="/dashboard" className="mb-6 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" /> Zpět
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"
        >
          {/* Kroky */}
          <div className="mb-6 flex items-center gap-2 text-xs font-bold">
            <span className={`flex h-6 w-6 items-center justify-center rounded-full ${step === 1 ? 'bg-emerald-500 text-white' : 'bg-emerald-100 text-emerald-700'}`}>
              {step === 1 ? '1' : <CheckCircle2 className="h-3.5 w-3.5" />}
            </span>
            <span className={step === 1 ? 'text-slate-900' : 'text-emerald-700'}>Zadejte IČO</span>
            <span className="h-px flex-1 bg-slate-200" />
            <span className={`flex h-6 w-6 items-center justify-center rounded-full ${step === 2 ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400'}`}>2</span>
            <span className={step === 2 ? 'text-slate-900' : 'text-slate-400'}>Potvrzení</span>
          </div>

          <AnimatePresence mode="wait">
            {step === 1 ? (
              <motion.div key="s1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Začněte nabízet své služby</h1>
                <p className="mb-6 mt-1.5 text-slate-500">
                  Stačí zadat IČO — najdeme vás v registru ARES. Váš účet zůstává stejný, jen se rozšíří.
                </p>

                <div className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-bold text-slate-800">IČO *</label>
                    <input
                      value={ico}
                      onChange={(e) => { setIco(e.target.value); setError('') }}
                      onKeyDown={(e) => { if (e.key === 'Enter') search() }}
                      inputMode="numeric" maxLength={11} placeholder="12345678"
                      className={`w-full rounded-xl border-[1.5px] px-4 py-3 text-[15px] tracking-wider outline-none transition focus:border-emerald-500 ${error ? 'border-red-400' : 'border-slate-200'}`}
                    />
                    <p className="mt-1.5 text-xs text-slate-400">8 číslic. V dalším kroku uvidíte, koho jsme našli.</p>
                  </div>

                  {error && (
                    <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}
                    </div>
                  )}

                  <button
                    onClick={search} disabled={loading}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3.5 font-extrabold text-white transition hover:bg-emerald-600 disabled:opacity-70"
                  >
                    {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Hledám v ARES…</> : <>Najít v registru <ArrowRight className="h-4 w-4" /></>}
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div key="s2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Sedí tyto údaje?</h1>
                <p className="mb-5 mt-1.5 text-slate-500">
                  Tohle jsme našli v registru ARES pod IČO <strong className="text-slate-700">{ico}</strong>.
                  Zkontrolujte, že jde opravdu o vás.
                </p>

                {/* Výpis z ARES */}
                <div className="mb-5 rounded-xl border-2 border-emerald-200 bg-emerald-50/50 p-4">
                  <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                    <ShieldCheck className="h-3.5 w-3.5" /> Registr ARES
                  </p>
                  <p className="flex items-start gap-2 text-base font-black text-slate-900">
                    <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                    {subject?.companyName}
                  </p>
                  {subject?.address && (
                    <p className="mt-1.5 flex items-start gap-2 text-sm text-slate-600">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                      {subject.address}
                    </p>
                  )}
                  {subject?.legalForm && (
                    <p className="mt-1.5 pl-6 text-xs text-slate-500">Právní forma: {subject.legalForm}</p>
                  )}
                </div>

                {/* Telefon (nepovinný) */}
                <div className="mb-4">
                  <label className="mb-1.5 block text-sm font-bold text-slate-800">
                    Telefon <span className="font-normal text-slate-400">(nepovinné)</span>
                  </label>
                  <input
                    value={phone} onChange={(e) => setPhone(e.target.value)}
                    inputMode="tel" placeholder="+420 777 123 456"
                    className="w-full rounded-xl border-[1.5px] border-slate-200 px-4 py-3 text-[15px] outline-none transition focus:border-emerald-500"
                  />
                  <p className="mt-1.5 text-xs text-slate-400">
                    Můžete doplnit později. Kontakt jde uvést i zvlášť u každé nabídky.
                  </p>
                </div>

                {/* Prohlášení */}
                <label className="mb-4 flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                  <input
                    type="checkbox" checked={agree}
                    onChange={(e) => { setAgree(e.target.checked); setError('') }}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="text-sm leading-relaxed text-slate-700">
                    Potvrzuji, že jsem <strong>oprávněn jednat za tento subjekt</strong> a že uvedené údaje patří mně.
                  </span>
                </label>

                <p className="mb-4 flex items-start gap-2 text-xs leading-relaxed text-slate-400">
                  <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Než začnete přijímat platby, ověří vaši totožnost i Stripe (doklad a bankovní účet na
                  vaše jméno). Uvedení cizího IČO tak nikam nevede.
                </p>

                {error && (
                  <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => { setStep(1); setError(''); setSubject(null) }}
                    disabled={loading}
                    className="rounded-xl border-[1.5px] border-slate-200 px-4 py-3.5 font-bold text-slate-600 transition hover:border-slate-300 disabled:opacity-50"
                  >
                    Zpět
                  </button>
                  <button
                    onClick={confirm} disabled={loading || !agree}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3.5 font-extrabold text-white transition hover:bg-emerald-600 disabled:opacity-50"
                  >
                    {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Ukládám…</> : 'Ano, to jsem já'}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Co bude následovat */}
          <div className="mt-6 space-y-2.5 border-t border-slate-100 pt-5">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Co bude dál</p>
            <p className="flex gap-2.5 text-sm text-slate-600">
              <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              Připravíte si nabídky — zdarma, kolik chcete
            </p>
            <p className="flex gap-2.5 text-sm text-slate-600">
              <Eye className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              Předplatné je zviditelní zákazníkům — první měsíc zdarma
            </p>
            <p className="flex gap-2.5 text-sm text-slate-600">
              <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              Napojení účtu vám umožní přijímat zálohy
            </p>
          </div>
        </motion.div>
      </div>
    </main>
  )
}