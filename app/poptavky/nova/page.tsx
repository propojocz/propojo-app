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
import { Loader2, CheckCircle2, Send, ArrowLeft, LogIn, Mail, Paperclip, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { createRequest, getRequestForRenew, renewRequest } from '@/lib/actions/requests'
import { createClient } from '@/lib/supabase/client'
import GalleryUpload from '@/components/ui/GalleryUpload'
import AddressInput from '@/components/ui/AddressInput'

export default function NovaPoptavkaPage() {
  const searchParams = useSearchParams()

  const [form, setForm] = useState({
    category: '',
    description: '',
    city: '',
    email: '',
    phone: '',
    preferred_date: '', // poznámka k termínu (volný text)
    when_from: '',
    when_to: '',
    when_part: 'kdykoli',
    place_pref: 'u_zakaznika',
    budget_from: '',
    budget_to: '',
  })
  const [photos, setPhotos] = useState<string[]>([])
  // Představa – vizualizace, jak to má vypadat (zvlášť od fotek skutečného stavu)
  const [inspiration, setInspiration] = useState<string[]>([])
  // Přesná adresa (nepovinná) – poskytovatelé uvidí jen obec, adresu až vybraný po potvrzení rezervace
  const [addr, setAddr] = useState<{ text: string; lat: number | null; lng: number | null }>({ text: '', lat: null, lng: null })
  const [addrKey, setAddrKey] = useState(0)
  // Poloha obce – podle ní poptávku uvidí hlavně poskytovatelé v okolí (3d, 7. 10. 2026)
  const [cityGeo, setCityGeo] = useState<{ lat: number; lng: number } | null>(null)
  // Obec předvyplněná z URL – změna klíče přenačte našeptávač s novou výchozí hodnotou
  const [cityPrefill, setCityPrefill] = useState('')
  // Obnovení staré poptávky (?obnovit=<id>): formulář se předvyplní a uloží se do stejné poptávky
  const renewId = searchParams.get('obnovit')
  const [renewLoaded, setRenewLoaded] = useState(false)
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
      if (city) setCityPrefill(city)
    }
  }, [searchParams])

  useEffect(() => {
    if (!renewId) return
    getRequestForRenew(renewId).then((r) => {
      if (!r) { setErrorMsg('Tuhle poptávku obnovit nejde (je pořád aktivní, nebo z ní už je objednávka).'); setState('error'); return }
      setForm((f) => ({
        ...f,
        category: r.category ?? '',
        description: r.description,
        city: r.city,
        phone: r.phone ?? '',
        preferred_date: r.preferredDate ?? '',
        budget_from: r.budgetFrom ? String(r.budgetFrom) : '',
        budget_to: r.budgetTo ? String(r.budgetTo) : '',
        place_pref: r.placePref ?? 'u_zakaznika',
      }))
      setPhotos(r.photos)
      setInspiration(r.inspirationPhotos ?? [])
      if (r.address) setAddr({ text: r.address.text, lat: r.address.lat, lng: r.address.lng })
      setAddrKey((k) => k + 1)
      setCityGeo(r.cityLat != null && r.cityLng != null ? { lat: r.cityLat, lng: r.cityLng } : null)
      setCityPrefill(r.city)
      setRenewLoaded(true)
    })
  }, [renewId])

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

  // „Kdy se vám to hodí“ → jeden čitelný text do poptávky (např. „12. 10. – 15. 10., odpoledne · ne ve středu“)
  const DAY_PART: Record<string, string> = { kdykoli: '', rano: 'ráno', odpoledne: 'odpoledne', vecer: 'večer' }
  const whenText = (): string => {
    const den = (iso: string) => new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric', timeZone: 'Europe/Prague' }).format(new Date(`${iso}T12:00:00Z`))
    const dates = form.when_from
      ? (form.when_to && form.when_to !== form.when_from ? `${den(form.when_from)} – ${den(form.when_to)}` : den(form.when_from))
      : ''
    const part = DAY_PART[form.when_part] ?? ''
    const head = [dates, part].filter(Boolean).join(', ')
    return [head, form.preferred_date.trim()].filter(Boolean).join(' · ')
  }

  const handleSubmit = async () => {
    // Adresa (nebo aspoň obec) musí být vybraná ze seznamu
    if (!form.city.trim()) {
      setState('error')
      setErrorMsg('Vyberte prosím adresu nebo obec ze seznamu.')
      return
    }
    setState('loading')
    setErrorMsg('')
    // createRequest bere stejná pole; category zůstává volný text, subcategory_id
    // zatím neřešíme (doplní se, až bude formulář krokovaný s výběrem oboru).
    const values = {
      category: form.category || null,
      description: form.description,
      city: form.city,
      city_lat: cityGeo?.lat ?? null,
      city_lng: cityGeo?.lng ?? null,
      email: form.email || null,
      phone: form.phone || null,
      preferred_date: whenText() || null,
      needed_at: form.when_from || null,
      place_pref: form.place_pref as 'u_zakaznika' | 'u_poskytovatele' | 'jedno',
      address: form.place_pref === 'u_poskytovatele' ? null : (addr.text.trim() || null),
      address_lat: addr.lat,
      address_lng: addr.lng,
      budget_from_kc: form.budget_from ? Math.round(Number(form.budget_from)) : null,
      budget_to_kc: form.budget_to ? Math.round(Number(form.budget_to)) : null,
      photos,
      inspiration_photos: inspiration,
    }
    const result = renewId && renewLoaded ? await renewRequest(renewId, values) : await createRequest(values)
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
          <h1 className="mt-4 text-xl font-black text-emerald-900">{renewId ? 'Poptávka je znovu aktivní!' : 'Poptávka odeslána!'}</h1>
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
        <h1 className="text-2xl font-black text-slate-900">{renewId ? 'Obnovit poptávku' : 'Nenašli jste, koho hledáte?'}</h1>
        <p className="mt-2 text-sm text-slate-600">
          {renewId
            ? 'Údaje jsme předvyplnili z původní poptávky – klidně je upravte (třeba termín). Po odeslání bude poptávka znovu 14 dní aktivní a dřívější zájemci dostanou vědět.'
            : 'Napište, co potřebujete. Poptávku uvidí poskytovatelé ve vašem okolí a mohou se vám ozvat — pak si z těch, kdo projeví zájem, vyberete.'}
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
          {/* Fotky jako příloha přímo u popisu – v telefonu nabídne galerii i fotoaparát */}
          <div className="pt-1">
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
              <Paperclip className="h-3.5 w-3.5 text-slate-400" /> Přidat foto <span className="font-normal text-slate-400">(nepovinné)</span>
            </p>
            <p className="mb-1.5 text-[11px] leading-relaxed text-slate-400">
              Fotka místa nebo problému – poskytovatel pak líp odhadne cenu.
            </p>
            <GalleryUpload value={photos} onChange={setPhotos} />
          </div>
          <div className="pt-2">
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
              <Sparkles className="h-3.5 w-3.5 text-slate-400" /> Máte i vizualizaci? <span className="font-normal text-slate-400">(nepovinné)</span>
            </p>
            <p className="mb-1.5 text-[11px] leading-relaxed text-slate-400">
              Přidejte sem, jak byste chtěli, aby to vypadalo – třeba návrh z AI, fotka z internetu nebo náčrt.
            </p>
            <GalleryUpload value={inspiration} onChange={(v) => setInspiration(v.slice(0, 8))} />
          </div>
        </div>

        <div className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-sm font-bold text-slate-800">Kde se to má konat?</label>
            <div className="flex flex-wrap gap-1.5">
              {([['u_zakaznika', 'U mě'], ['u_poskytovatele', 'U poskytovatele'], ['jedno', 'Obojí je možné']] as const).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => set('place_pref', v)}
                  className={`rounded-xl border-[1.5px] px-3.5 py-2 text-sm font-semibold transition ${form.place_pref === v ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-400">Např. masáž doma, nebo v salonu poskytovatele.</p>
          </div>
          {/* Jedno pole: ulice s číslem, nebo jen obec. Poskytovatelé uvidí jen obec, zbytek až po zaplacení. */}
          <div className="space-y-1.5">
            <label className="text-sm font-bold text-slate-800">Adresa *</label>
            <AddressInput
              key={`addr-${addrKey}-${cityPrefill}`}
              allowMunicipality
              defaultValue={addr.text || cityPrefill}
              placeholder={form.place_pref === 'u_poskytovatele' ? 'Obec, kde jste – vyberte ze seznamu…' : 'Ulice a číslo, nebo jen obec – vyberte ze seznamu…'}
              onPick={(a) => {
                set('city', a.municipality || a.address)
                // Obec: souřadnice obce rovnou; u adresy je dohledá server podle názvu obce
                setCityGeo(a.kind === 'municipality' ? { lat: a.lat, lng: a.lng } : null)
                setAddr(a.kind === 'address' ? { text: a.address, lat: a.lat, lng: a.lng } : { text: '', lat: null, lng: null })
              }}
              onFreeText={(t) => { set('city', ''); setCityGeo(null); setAddr({ text: t, lat: null, lng: null }) }}
            />
            <p className="text-[11px] text-slate-400">
              {form.place_pref === 'u_poskytovatele'
                ? 'Stačí obec – podle ní poptávku uvidí poskytovatelé v okolí.'
                : 'Poskytovatelé uvidí jen obec. Ulici a číslo uvidí jen ten, koho vyberete, a to po zaplacení.'}
            </p>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-bold text-slate-800">
              Kdy se vám to hodí? <span className="font-normal text-slate-400">(nepovinné)</span>
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <input type="date" value={form.when_from} onChange={(e) => set('when_from', e.target.value)} aria-label="Od"
                className="rounded-xl border-[1.5px] border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-emerald-500" />
              <span className="text-slate-400">–</span>
              <input type="date" value={form.when_to} min={form.when_from || undefined} onChange={(e) => set('when_to', e.target.value)} aria-label="Do"
                className="rounded-xl border-[1.5px] border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-emerald-500" />
              <select value={form.when_part} onChange={(e) => set('when_part', e.target.value)}
                className="rounded-xl border-[1.5px] border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-emerald-500">
                <option value="kdykoli">kdykoli</option>
                <option value="rano">ráno</option>
                <option value="odpoledne">odpoledne</option>
                <option value="vecer">večer</option>
              </select>
            </div>
            <input
              value={form.preferred_date}
              onChange={(e) => set('preferred_date', e.target.value)}
              placeholder="Poznámka, např. do konce měsíce, ne ve středu"
              className="w-full rounded-xl border-[1.5px] border-slate-200 px-4 py-2.5 text-sm outline-none transition focus:border-emerald-500"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-bold text-slate-800">
            Rozpočet <span className="font-normal text-slate-400">(nepovinné, nezávazné)</span>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <input type="number" min={1} inputMode="numeric" value={form.budget_from} onChange={(e) => set('budget_from', e.target.value)} placeholder="od"
              className="w-32 rounded-xl border-[1.5px] border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-emerald-500" />
            <span className="text-slate-400">–</span>
            <input type="number" min={1} inputMode="numeric" value={form.budget_to} onChange={(e) => set('budget_to', e.target.value)} placeholder="do"
              className="w-32 rounded-xl border-[1.5px] border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-emerald-500" />
            <span className="text-sm text-slate-500">Kč</span>
          </div>
          <p className="text-[11px] text-slate-400">Pomůže poskytovatelům poslat odpovídající nabídku. Přes Propojo platíte jen rezervační poplatek nebo cenu výjezdu, cenu zakázky si domluvíte s poskytovatelem.</p>
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
            <><Send className="h-4 w-4" /> {renewId ? 'Obnovit poptávku' : 'Odeslat poptávku'}</>
          )}
        </button>

        <p className="text-center text-xs text-slate-400">
          Odesláním souhlasíte se zpracováním kontaktu za účelem zprostředkování služby.
        </p>
      </div>
    </div>
  )
}