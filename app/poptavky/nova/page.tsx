'use client'
// app/poptavky/nova/page.tsx
// Formulář pro zanechání poptávky. Funguje i bez přihlášení (fotky jen pro přihlášené).
//
// Zapisuje do requests přes createRequest. Poptávku uvidí poskytovatelé a klikají
// „Mám zájem" — kontakt zákazníka zůstává skrytý až do výběru.
//
// PODMÍNĚNO REGISTRACÍ: poptávku smí zanechat jen přihlášený (jinak nemá jak se
// k jednání vrátit a selectProvider by u anonymní poptávky selhal). Nepřihlášený
// vidí výzvu k přihlášení (Google / e-mail) s návratem sem. Neregistrovaní přes
// číslo/mail jsou pozdější rozšíření.

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Loader2, CheckCircle2, Send, ArrowLeft, LogIn, Mail } from 'lucide-react'
import Link from 'next/link'
import { createRequest } from '@/lib/actions/requests'
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
  const [authChecked, setAuthChecked] = useState(false)
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
      setAuthChecked(true)
    }
    check()
  }, [])

  const set = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }))

  const handleSubmit = async () => {
    setState('loading')
    setErrorMsg('')
    // createRequest bere stejná pole; category zůstává volný text, subcategory_id
    // zatím neřešíme (doplní se, až bude formulář krokovaný s výběrem oboru).
    const result = await createRequest({
      category: form.category || null,
      description: form.description,
      city: form.city,
      email: form.email || null,
      phone: form.phone || null,
      preferred_date: form.preferred_date || null,
      photos,
    })
    if (result.success) {
      setState('done')
    } else {
      setState('error')
      setErrorMsg(result.error ?? 'Něco se nepovedlo.')
    }
  }

  // Dokud nevíme stav přihlášení, nic neproblikáváme.
  if (!authChecked) {
    return (
      <div className="mx-auto flex max-w-lg items-center justify-center px-4 py-24 sm:px-6">
        <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
      </div>
    )
  }

  // Nepřihlášený → výzva k přihlášení (poptávku smí zanechat jen účet).
  if (!isLoggedIn) {
    const next = encodeURIComponent('/poptavky/nova')
    return (
      <div className="mx-auto max-w-lg px-4 py-12 sm:px-6">
        <Link href="/marketplace" className="mb-6 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" /> Zpět
        </Link>
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50">
            <Send className="h-5 w-5 text-emerald-600" />
          </div>
          <h1 className="text-xl font-black text-slate-900">Pro zanechání poptávky se přihlaste</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm text-slate-600">
            Přes účet se k vám poskytovatelé dostanou v chatu a vy si pohlídáte, koho si vyberete.
            Zabere to chvilku a poptávku pak zadáte hned.
          </p>
          <div className="mt-6">
            <Link
              href={`/prihlasit?next=${next}`}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-600"
            >
              <LogIn className="h-4 w-4" /> Přihlásit se nebo vytvořit účet
            </Link>
          </div>
          <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-slate-400">
            <Mail className="h-3.5 w-3.5" /> Rychle přes Google nebo e-mail — vyberete na přihlašovací stránce.
          </p>
        </div>
      </div>
    )
  }

  if (state === 'done') {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center sm:px-6">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
          <h1 className="mt-4 text-xl font-black text-emerald-900">Poptávka odeslána!</h1>
          <p className="mt-2 text-sm text-emerald-700">
            Děkujeme. Vaše poptávka je teď vidět poskytovatelům ve vašem okolí — kdo bude mít zájem,
            ozve se vám přes Propojo. Kontakt uvidí až ve chvíli, kdy si někoho vyberete.
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Link href="/dashboard/poptavky" className="btn-primary justify-center">
              Moje poptávky
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
      <Link href="/marketplace" className="mb-6 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Zpět
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-black text-slate-900">Nenašli jste, koho hledáte?</h1>
        <p className="mt-2 text-sm text-slate-600">
          Napište, co potřebujete. Poptávku uvidí poskytovatelé ve vašem okolí a mohou se vám ozvat —
          pak si z těch, kdo projeví zájem, vyberete.
        </p>
      </div>

      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="space-y-1.5">
          <label className="text-sm font-bold text-slate-800">Jakou službu hledáte? *</label>
          <input
            value={form.category}
            onChange={(e) => set('category', e.target.value)}
            placeholder="Např. malíř, instalatér, sádrokartonář…"
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
              placeholder="Např. Rožnov pod Radhoštěm"
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
          <p className="text-xs text-slate-400">Poskytovatel ho uvidí, až si ho vyberete. Jinak vás kontaktuje přes chat.</p>
        </div>

        {/* Fotky – přihlášený je tu vždy (nepřihlášený sem nedojde). */}
        <div className="space-y-1.5">
          <label className="text-sm font-bold text-slate-800">
            Fotky <span className="font-normal text-slate-400">(nepovinné)</span>
          </label>
          <p className="text-xs text-slate-400">Fotka pomůže poskytovateli rychle pochopit, o co jde.</p>
          <div className="pt-1">
            <GalleryUpload value={photos} onChange={setPhotos} />
          </div>
        </div>

        <div className="flex items-start gap-2 rounded-xl bg-blue-50 px-4 py-3 text-xs leading-relaxed text-blue-800">
          <span>
            Vaše poptávka bude aktivní 14 dní. Kontaktní údaje uvidí jen poskytovatel, kterého si nakonec vyberete.
          </span>
        </div>

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
          Odesláním souhlasíte se zpracováním kontaktu za účelem zprostředkování služby.
        </p>
      </div>
    </div>
  )
}