'use client'
// app/registrace/zivnostnik/page.tsx

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { Eye, EyeOff, Loader2, AlertCircle, CheckCircle2, Search, Building2, ArrowRight, ArrowLeft } from 'lucide-react'
import { z } from 'zod'

const schema = z.object({
  email: z.string().email('Neplatný email'),
  password: z.string().min(8, 'Heslo musí mít alespoň 8 znaků'),
  password_confirm: z.string().min(1, 'Zadejte heslo znovu'),
  full_name: z.string().min(2, 'Zadejte celé jméno'),
  ico: z.string().regex(/^\d{8}$/, 'IČO musí mít přesně 8 číslic'),
  phone: z.string().min(9, 'Zadejte platné telefonní číslo'),
  city: z.string().min(2, 'Zadejte město'),
}).refine((d) => d.password === d.password_confirm, {
  message: 'Hesla se neshodují',
  path: ['password_confirm'],
})
type FormValues = z.infer<typeof schema>

interface AresResult {
  ico: string
  obchodniJmeno: string
  sidlo: { nazevObce: string; nazevUlice?: string }
  pravniForma: string
}

type Step = 1 | 2 | 3

export default function ZivnostnikRegistracePage() {
  const [step, setStep] = useState<Step>(1)
  const [showPassword, setShowPassword] = useState(false)
  const [serverError, setServerError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [ico, setIco] = useState('')
  const [icoLoading, setIcoLoading] = useState(false)
  const [icoError, setIcoError] = useState('')
  const [aresData, setAresData] = useState<AresResult | null>(null)

  const { register: f, handleSubmit, setValue, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  const handleVerifyICO = async () => {
    if (!/^\d{8}$/.test(ico)) { setIcoError('IČO musí mít přesně 8 číslic.'); return }
    setIcoLoading(true); setIcoError(''); setAresData(null)
    try {
      const res = await fetch(`/api/ares?ico=${ico}`)
      const data = await res.json()
      if (!res.ok) { setIcoError(data.error ?? 'Chyba při ověřování.') }
      else {
        setAresData(data)
        setValue('ico', ico)
        if (data.sidlo?.nazevObce) setValue('city', data.sidlo.nazevObce)
      }
    } catch { setIcoError('Nelze se připojit k ARES.') }
    finally { setIcoLoading(false) }
  }

  // Volá API route místo Server Action – spolehlivější
  const onSubmit = async (data: FormValues) => {
    if (!aresData) return
    setIsLoading(true); setServerError('')
    try {
      const { password_confirm, ...payload } = data
      const res = await fetch('/api/register-provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, company_name: aresData.obchodniJmeno }),
      })
      const result = await res.json()
      if (res.ok) { setSuccess(true) }
      else { setServerError(result.error ?? 'Nastala neočekávaná chyba.'); setIsLoading(false) }
    } catch { setServerError('Nastala neočekávaná chyba.'); setIsLoading(false) }
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
          </div>
          <h2 className="mb-2 text-2xl font-black text-slate-900">Vítejte na palubě!</h2>
          <p className="text-slate-500 mb-2">Poslali jsme vám potvrzovací email. Po potvrzení budete přesměrováni na průvodce nastavením profilu.</p>
          <p className="text-xs text-slate-400 mb-6">Zkontrolujte i složku Spam.</p>
          <Link href="/prihlasit" className="btn-primary w-full justify-center">Přejít na přihlášení</Link>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
        <div className="mb-8 flex items-center justify-between">
          <Link href="/" className="flex items-center">
            <img src="/propojo-logo.png" alt="Propojo" className="h-8 w-auto object-contain" />
          </Link>
          <Link href="/registrace" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
            <ArrowLeft className="h-4 w-4" /> Zpět
          </Link>
        </div>

        {/* Progress */}
        <div className="mb-8 flex items-center gap-2">
          {[{ num: 1, label: 'Ověření IČO' }, { num: 2, label: 'Vaše údaje' }, { num: 3, label: 'Heslo a email' }].map((s, i) => (
            <div key={s.num} className="flex items-center gap-2 flex-1">
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-all ${step > s.num ? 'bg-emerald-500 text-white' : step === s.num ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
                {step > s.num ? <CheckCircle2 className="h-4 w-4" /> : s.num}
              </div>
              <p className={`hidden sm:block text-xs font-semibold ${step === s.num ? 'text-emerald-700' : 'text-slate-400'}`}>{s.label}</p>
              {i < 2 && <div className={`flex-1 h-0.5 ${step > s.num ? 'bg-emerald-400' : 'bg-slate-200'}`} />}
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <AnimatePresence mode="wait">

            {step === 1 && (
              <motion.div key="s1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <h1 className="mb-1.5 text-2xl font-black text-slate-900">Ověření živnostenského oprávnění</h1>
                <p className="mb-6 text-slate-500 text-sm">Zadejte své IČO – automaticky ověříme vaše údaje v registru ARES.</p>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="form-label">IČO *</label>
                    <div className="flex gap-2">
                      <input value={ico} onChange={e => { setIco(e.target.value.replace(/\D/g, '').slice(0, 8)); setIcoError(''); setAresData(null) }} onKeyDown={e => e.key === 'Enter' && handleVerifyICO()} placeholder="12345678" maxLength={8} className={`form-input font-mono text-lg tracking-widest ${icoError ? 'form-input-error' : ''}`} />
                      <button type="button" onClick={handleVerifyICO} disabled={icoLoading || ico.length !== 8} className="btn-primary shrink-0">
                        {icoLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                        {icoLoading ? 'Ověřuji…' : 'Ověřit'}
                      </button>
                    </div>
                    {icoError && <p className="form-error">{icoError}</p>}
                  </div>
                  <AnimatePresence>
                    {aresData && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
                        <div className="flex items-start gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100"><Building2 className="h-5 w-5 text-emerald-600" /></div>
                          <div>
                            <div className="flex items-center gap-2 mb-1"><CheckCircle2 className="h-4 w-4 text-emerald-600" /><span className="text-sm font-bold text-emerald-800">IČO ověřeno v ARES</span></div>
                            <p className="text-base font-black text-slate-900">{aresData.obchodniJmeno}</p>
                            <p className="text-sm text-slate-600 mt-0.5">{aresData.sidlo?.nazevObce}</p>
                            <div className="mt-2 flex gap-2">
                              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">IČO: {aresData.ico}</span>
                              {aresData.pravniForma && <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">{aresData.pravniForma}</span>}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 text-xs text-slate-500">
                    <strong className="text-slate-700">Proč ověřujeme IČO?</strong> Zajišťujeme, aby na platformě byli pouze skuteční živnostníci. Data načítáme z veřejného registru ARES.
                  </div>
                  <button type="button" onClick={() => setStep(2)} disabled={!aresData} className="btn-primary w-full">
                    Pokračovat <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div key="s2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <h1 className="mb-1.5 text-2xl font-black text-slate-900">Vaše kontaktní údaje</h1>
                <p className="mb-6 text-slate-500 text-sm">Tyto údaje uvidí zákazníci na vašem profilu.</p>
                {aresData && (
                  <div className="mb-5 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span className="text-sm font-semibold text-emerald-800">{aresData.obchodniJmeno}</span>
                    <span className="text-xs text-emerald-600 ml-auto">IČO {aresData.ico}</span>
                  </div>
                )}
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="form-label">Celé jméno *</label>
                    <input {...f('full_name')} placeholder="Jan Novák" className={`form-input ${errors.full_name ? 'form-input-error' : ''}`} />
                    {errors.full_name && <p className="form-error">{errors.full_name.message}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <label className="form-label">Telefon *</label>
                    <input {...f('phone')} type="tel" placeholder="+420 777 123 456" className={`form-input ${errors.phone ? 'form-input-error' : ''}`} />
                    {errors.phone && <p className="form-error">{errors.phone.message}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <label className="form-label">Město působiště *</label>
                    <input {...f('city')} placeholder="Vsetín" className={`form-input ${errors.city ? 'form-input-error' : ''}`} />
                    {errors.city && <p className="form-error">{errors.city.message}</p>}
                  </div>
                  <div className="flex gap-3">
                    <button type="button" onClick={() => setStep(1)} className="btn-secondary flex-1"><ArrowLeft className="h-4 w-4" /> Zpět</button>
                    <button type="button" onClick={() => setStep(3)} className="btn-primary flex-1">Pokračovat <ArrowRight className="h-4 w-4" /></button>
                  </div>
                </div>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div key="s3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <h1 className="mb-1.5 text-2xl font-black text-slate-900">Přihlašovací údaje</h1>
                <p className="mb-6 text-slate-500 text-sm">Zvolte email a heslo pro přihlášení.</p>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                  <input {...f('ico')} type="hidden" />
                  <input {...f('phone')} type="hidden" />
                  <input {...f('city')} type="hidden" />
                  <div className="space-y-1.5">
                    <label className="form-label">Email *</label>
                    <input {...f('email')} type="email" placeholder="vas@email.cz" className={`form-input ${errors.email ? 'form-input-error' : ''}`} />
                    {errors.email && <p className="form-error">{errors.email.message}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <label className="form-label">Heslo *</label>
                    <div className="relative">
                      <input {...f('password')} type={showPassword ? 'text' : 'password'} placeholder="Alespoň 8 znaků" className={`form-input pr-10 ${errors.password ? 'form-input-error' : ''}`} />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {errors.password && <p className="form-error">{errors.password.message}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <label className="form-label">Heslo znovu *</label>
                    <div className="relative">
                      <input {...f('password_confirm')} type={showPassword ? 'text' : 'password'} placeholder="Zadejte heslo ještě jednou" className={`form-input pr-10 ${errors.password_confirm ? 'form-input-error' : ''}`} />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {errors.password_confirm && <p className="form-error">{errors.password_confirm.message}</p>}
                  </div>
                  <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 text-xs text-slate-500">
                    Registrací souhlasíte s <Link href="/podminky" className="underline text-slate-700">podmínkami služby</Link> a <Link href="/pravidla-komunity" className="underline text-slate-700">pravidly komunity</Link>.
                  </div>
                  <AnimatePresence>
                    {serverError && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        <AlertCircle className="h-4 w-4 shrink-0" />{serverError}
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <div className="flex gap-3">
                    <button type="button" onClick={() => setStep(2)} className="btn-secondary"><ArrowLeft className="h-4 w-4" /></button>
                    <button type="submit" disabled={isLoading} className="btn-primary flex-1">
                      {isLoading ? <><Loader2 className="h-4 w-4 animate-spin" /> Registruji…</> : 'Dokončit registraci'}
                    </button>
                  </div>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <p className="mt-4 text-center text-sm text-slate-500">Již máte účet? <Link href="/prihlasit" className="font-semibold text-emerald-600 hover:underline">Přihlásit se</Link></p>
      </div>
    </div>
  )
}