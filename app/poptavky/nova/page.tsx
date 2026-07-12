'use client'
// app/poptavky/nova/page.tsx
// Formulář pro zanechání poptávky. Funguje i bez přihlášení (fotky jen pro přihlášené).

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Loader2, CheckCircle2, Send, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { createLead } from '@/lib/actions/leads'
import { createClient } from '@/lib/supabase/client'
import GalleryUpload from '@/components/ui/GalleryUpload'

export default function NovaPoptavkaPage() {
  const searchParams = useSearchParams()

  const [form, setForm] = useState({
    category: '',
    description: '',
    city: '',
    email: '',
    phone: '',
    preferred_date: '',
  })
  const [photos, setPhotos] = useState<string[]>([])
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  // Předvyplnění z URL (z prázdného stavu marketplace: ?category=...&city=...)
  useEffect(() => {
    const category = searchParams.get('category') ?? ''
    const city = searchParams.get('city') ?? ''
    if (category || city) {
      setForm((f) => ({ ...f, category: category || f.category, city: city || f.city }))
    }
  }, [searchParams])

  // Zjistíme přihlášení – fotky umožníme jen přihlášeným. Předvyplníme e-mail.
  useEffect(() => {
    const check = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setIsLoggedIn(true)
        if (user.email) setForm((f) => ({ ...f, email: user.email as string }))
      }
    }
    check()
  }, [])

  const set = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }))

  const handleSubmit = async () => {
    setState('loading')
    setErrorMsg('')
    const result = await createLead({ ...form, photos })
    if (result.success) {
      setState('done')
    } else {
      setState('error')
      setErrorMsg(result.error ?? 'Něco se nepovedlo.')
    }
  }

  if (state === 'done') {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center sm:px-6">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
          <h1 className="mt-4 text-xl font-black text-emerald-900">Poptávka odeslána!</h1>
          <p className="mt-2 text-sm text-emerald-700">
            Děkujeme. Vaše poptávka je teď vidět řemeslníkům — ozvou se vám. A jakmile najdeme
            vhodného poskytovatele ve vaší lokalitě, dáme vám vědět i my.
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Link href="/poptavky" className="btn-primary justify-center">
              Zobrazit poptávky
            </Link>
            <Link href="/marketplace" className="btn-secondary justify-center">
              Prohlédnout služby
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-10 sm:px-6">
      <Link href="/poptavky" className="mb-6 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Zpět na poptávky
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-black text-slate-900">Nenašli jste, koho hledáte?</h1>
        <p className="mt-2 text-sm text-slate-600">
          Zanechte nám poptávku. Uvidí ji ověření řemeslníci a mohou se vám ozvat sami — a pokud ve
          vaší lokalitě zatím nikoho nemáme, postaráme se a dáme vám vědět.
        </p>
      </div>

      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="space-y-1.5">
          <label className="text-sm font-bold text-slate-800">Jakou službu hledáte? *</label>
          <input
            value={form.category}
            onChange={(e) => set('category', e.target.value)}
            placeholder="Např. sádrokartonář, malíř, instalatér…"
            className="w-full rounded-xl border-[1.5px] border-slate-200 px-4 py-3 text-[15px] outline-none transition focus:border-emerald-500"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-bold text-slate-800">Co potřebujete? *</label>
          <textarea
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            rows={4}
            maxLength={1000}
            placeholder="Popište práci – co, jak velké, jakou máte představu…"
            className="w-full resize-none rounded-xl border-[1.5px] border-slate-200 px-4 py-3 text-[15px] outline-none transition focus:border-emerald-500"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-sm font-bold text-slate-800">Město / lokalita *</label>
            <input
              value={form.city}
              onChange={(e) => set('city', e.target.value)}
              placeholder="Např. Kelč"
              className="w-full rounded-xl border-[1.5px] border-slate-200 px-4 py-3 text-[15px] outline-none transition focus:border-emerald-500"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-bold text-slate-800">
              Kdy by se hodilo? <span className="font-normal text-slate-400">(nepovinné)</span>
            </label>
            <input
              value={form.preferred_date}
              onChange={(e) => set('preferred_date', e.target.value)}
              placeholder="Např. do konce měsíce"
              className="w-full rounded-xl border-[1.5px] border-slate-200 px-4 py-3 text-[15px] outline-none transition focus:border-emerald-500"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-sm font-bold text-slate-800">Váš e-mail *</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              placeholder="vas@email.cz"
              className="w-full rounded-xl border-[1.5px] border-slate-200 px-4 py-3 text-[15px] outline-none transition focus:border-emerald-500"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-bold text-slate-800">
              Telefon <span className="font-normal text-slate-400">(nepovinné)</span>
            </label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              placeholder="+420 777 123 456"
              className="w-full rounded-xl border-[1.5px] border-slate-200 px-4 py-3 text-[15px] outline-none transition focus:border-emerald-500"
            />
          </div>
        </div>

        {/* Fotky – jen pro přihlášené (Storage je pustí jen jim) */}
        {isLoggedIn ? (
          <div className="space-y-1.5">
            <label className="text-sm font-bold text-slate-800">
              Fotky <span className="font-normal text-slate-400">(nepovinné)</span>
            </label>
            <p className="text-xs text-slate-400">Fotka pomůže řemeslníkovi rychle pochopit, o co jde.</p>
            <div className="pt-1">
              <GalleryUpload value={photos} onChange={setPhotos} />
            </div>
          </div>
        ) : (
          <p className="rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-500">
            Chcete přiložit fotky?{' '}
            <Link href="/prihlasit?next=/poptavky/nova" className="font-bold text-emerald-600 hover:underline">
              Přihlaste se
            </Link>{' '}
            – poptávku ale můžete odeslat i bez přihlášení.
          </p>
        )}

        {state === 'error' && <p className="text-sm text-red-600">{errorMsg}</p>}

        <button
          onClick={handleSubmit}
          disabled={state === 'loading'}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3.5 font-extrabold text-white transition hover:bg-emerald-600 disabled:opacity-70"
        >
          {state === 'loading' ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Odesílám…</>
          ) : (
            <><Send className="h-4 w-4" /> Odeslat poptávku</>
          )}
        </button>

        <p className="text-center text-xs text-slate-400">
          Odesláním souhlasíte se zpracováním kontaktu za účelem zprostředkování služby. Vaše poptávka
          bude viditelná ověřeným řemeslníkům.
        </p>
      </div>
    </div>
  )
}