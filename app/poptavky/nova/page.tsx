'use client'
// app/poptavky/nova/page.tsx
// Formulář na vyvěšení poptávky. Jen pro přihlášené (dle RLS: author_id = auth.uid()).

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Loader2, ArrowLeft, CheckCircle2, AlertCircle } from 'lucide-react'

export default function NovaPoptavkaPage() {
  const router = useRouter()
  const supabase = createClient()

  const [checking, setChecking] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [city, setCity] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [contactEmail, setContactEmail] = useState('')

  // Ověření přihlášení + předvyplnění jména
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/prihlasit?next=/poptavky/nova'); return }
      setUserId(user.id)
      const { data: profile } = await supabase
        .from('profiles').select('full_name').eq('id', user.id).single() as { data: { full_name: string | null } | null }
      if (profile?.full_name) setContactName(profile.full_name)
      setContactEmail(user.email ?? '')
      setChecking(false)
    })()
  }, [router, supabase])

  const handleSubmit = async () => {
    setError('')
    if (title.trim().length < 3) { setError('Napište stručně, co sháníte.'); return }
    if (city.trim().length < 2) { setError('Zadejte město nebo obec.'); return }
    if (contactName.trim().length < 2) { setError('Zadejte jméno pro kontakt.'); return }
    if (!contactPhone.trim() && !contactEmail.trim()) { setError('Zadejte alespoň telefon nebo e-mail.'); return }

    setLoading(true)
    const { error: insErr } = await (supabase.from('poptavky') as any).insert({
      author_id: userId,
      title: title.trim(),
      description: description.trim() || null,
      category: category.trim() || null,
      city: city.trim(),
      contact_name: contactName.trim(),
      contact_phone: contactPhone.trim() || null,
      contact_email: contactEmail.trim() || null,
    })
    if (insErr) { setError('Poptávku se nepodařilo uložit. Zkuste to prosím znovu.'); setLoading(false); return }
    setDone(true)
  }

  if (checking) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
      </div>
    )
  }

  if (done) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
          <CheckCircle2 className="h-8 w-8 text-emerald-600" />
        </div>
        <h1 className="mb-2 text-2xl font-black text-slate-900">Poptávka je vyvěšená!</h1>
        <p className="mb-6 text-slate-500">Řemeslníci ji teď uvidí a mohou se vám ozvat.</p>
        <Link href="/poptavky" className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 font-bold text-white hover:bg-emerald-600">
          Zobrazit poptávky
        </Link>
      </div>
    )
  }

  const inputCls = 'w-full rounded-xl border-[1.5px] border-slate-200 px-4 py-3 text-[15px] outline-none transition focus:border-emerald-500'

  return (
    <div className="mx-auto max-w-lg px-4 py-8 sm:px-6">
      <Link href="/poptavky" className="mb-6 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Zpět na poptávky
      </Link>

      <h1 className="text-2xl font-black text-slate-900">Vyvěsit poptávku</h1>
      <p className="mb-6 mt-1 text-sm text-slate-500">Popište, co sháníte. Řemeslníci s předplatným se vám ozvou.</p>

      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-bold text-slate-800">Co sháníte? *</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Např. Sháním malíře na byt 2+1" className={inputCls} maxLength={100} />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-bold text-slate-800">Podrobnosti</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Rozsah práce, termín, cokoli důležitého…" rows={4} className={inputCls} maxLength={1000} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-sm font-bold text-slate-800">Obor</label>
            <input value={category} onChange={e => setCategory(e.target.value)} placeholder="Malíř, instalatér…" className={inputCls} maxLength={50} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-bold text-slate-800">Město / obec *</label>
            <input value={city} onChange={e => setCity(e.target.value)} placeholder="Vsetín" className={inputCls} maxLength={80} />
          </div>
        </div>

        <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-4">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Kontakt pro řemeslníky</p>
          <div>
            <label className="mb-1.5 block text-sm font-bold text-slate-800">Jméno *</label>
            <input value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Jan Novák" className={inputCls} maxLength={80} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-bold text-slate-800">Telefon</label>
              <input value={contactPhone} onChange={e => setContactPhone(e.target.value)} type="tel" placeholder="+420…" className={inputCls} maxLength={20} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-bold text-slate-800">E-mail</label>
              <input value={contactEmail} onChange={e => setContactEmail(e.target.value)} type="email" placeholder="vas@email.cz" className={inputCls} maxLength={120} />
            </div>
          </div>
          <p className="text-xs text-slate-400">Vyplňte alespoň jedno. Kontakt uvidí jen řemeslníci s aktivním předplatným.</p>
        </div>

        {error && (
          <div className="flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3.5 font-bold text-white transition hover:bg-emerald-600 disabled:opacity-70"
        >
          {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Vyvěšuji…</> : 'Vyvěsit poptávku'}
        </button>
      </div>
    </div>
  )
}