'use client'
// components/ui/PoptavkaChat.tsx
// Konverzace jednání o poptávce. Desktop: vlevo Moje jednání, uprostřed chat
// (stejný ChatThread jako u objednávek), vpravo kontext poptávky. Mobil: jen chat
// se zpětným odkazem, rail je skrytý (seznam je na /poptavky).
//
// Před výběrem poskytovatele se objednávka NEVYTVÁŘÍ — píše se přes
// sendConversationMessage (conversation_id).
//
// 10. 10. 2026 (Matej): chat skládá domluvu. Zákazník pošle, kdy se mu to hodí, a rozpočet,
// poskytovatel odhad ceny a termíny; obě strany můžou přiložit fotku nebo PDF. Nahoře je souhrn
// „Co je domluveno“. Vybrat poskytovatele jde jen s navrženým termínem („Vybrat a rezervovat“)
// → shrnutí s adresou → platba; poptávka se ostatním uzavře až zaplacením.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Send, Loader2, ArrowLeft, MapPin, CalendarClock, Tag, Lock, Paperclip, X, FileText,
  Coins, CheckCircle2, MessagesSquare, CalendarDays, ClipboardList,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { sendConversationMessage, sendPriceEstimate, proposeTermInChat, selectProviderWithTerm, sendCustomerPreference, endNegotiation, resumeNegotiation, requestResume, setRequestAddressInChat, pollThreadMessages, type EndReason } from '@/lib/actions/conversation-chat'
import { BOOKING_POLICY } from '@/lib/booking/policy'
import { rozpocetText } from '@/lib/format'
import ChatThread from '@/components/ui/ChatThread'
import BookingWizard from '@/components/ui/BookingWizard'
import ServiceMap from '@/components/ui/ServiceMap'
import AddressInput from '@/components/ui/AddressInput'

export type ThreadItem = {
  conversationId: string
  requestId: string
  primary: string
  secondary: string
  badge: string | null
  isCurrent: boolean
}

type RequestCtx = {
  /** Představa zákazníka – vizualizace, jak to má vypadat */
  inspirationPhotos?: string[]
  /** Nezávazný rozpočet zákazníka z poptávky (Kč) */
  budgetFrom?: number | null
  budgetTo?: number | null
  heading: string
  category: string | null
  city: string
  description: string
  preferredDate: string | null
  photos: string[]
}

export default function PoptavkaChat({
  conversationId, requestId, responseId,
  isProvider, readOnly, orderId, canSelect, hasServiceForOrder, offerText = null, offerKind = null,
  otherName, distanceKm = null, draftOrderId = null, place = null, customerAddress = null, declinedBy = null, request, threads, initialMessages, myUserId, senderNames,
  offerEditor = null, isPrivate = false, defaultTermMinutes = null, counterpart = null, placeEditor = null, cityKnown = true,
}: {
  conversationId: string
  requestId: string
  responseId: string
  isProvider: boolean
  readOnly: boolean
  orderId: string | null
  canSelect: boolean
  hasServiceForOrder: boolean
  /** Nabídka poskytovatele: „Cena výjezdu 500 Kč · odečte se z ceny zakázky“ (null = neuvedená) */
  offerText?: string | null
  /** Typ nabídky: B = termín je okno příjezdu, A = délka služby */
  offerKind?: 'A' | 'B' | null
  otherName: string
  /** Vzdálenost obce poptávky od místa, odkud poskytovatel vyjíždí (vzdušnou čarou) */
  distanceKm?: number | null
  /** Zákazník už vybral termín, ale nezaplatil – rozpracovaná rezervace */
  draftOrderId?: string | null
  /** Místo konání z nabídky (u poskytovatele = provozovna s adresou) a přání zákazníka z poptávky */
  place?: { atProvider: boolean; address: string | null; lat: number | null; lng: number | null; pref: string | null } | null
  /** Přesná adresa zákazníka z poptávky – jen v pohledu zákazníka */
  customerAddress?: string | null
  /** „Nemám zájem“ – kdo zájem zrušil (chat zůstává otevřený) */
  declinedBy?: 'provider' | 'customer' | null
  request: RequestCtx
  threads: ThreadItem[]
  initialMessages: any[]
  myUserId: string
  senderNames: Record<string, string>
  /** Poskytovatel: „Doplnit / Upravit nabídku“ přímo v chatu (InterestAction v režimu chatu) */
  offerEditor?: React.ReactNode
  /** Soukromá poptávka – dotaz pro jednoho poskytovatele (mimo veřejnou nástěnku) */
  isPrivate?: boolean
  /** Délka navrhovaného termínu z vybrané položky ceníku (min) */
  defaultTermMinutes?: number | null
  /** Obec zákazníka je opravdu jeho (u soukromé poptávky až z adresy / profilu) */
  cityKnown?: boolean
  /** Poskytovatel: „Změnit místo“ (U zákazníka / U mě) u řádku Místo konání */
  placeEditor?: React.ReactNode
  /** Soukromý dotaz: s kým jednám – zákazník vidí poskytovatele (jméno, profese, obec, o mně), poskytovatel zákazníka */
  counterpart?: { name: string; subtitle: string | null; city: string | null; about: string | null; profileUrl: string | null } | null
}) {
  const router = useRouter()
  const [messages, setMessages] = useState<any[]>(initialMessages)
  const messagesRef = useRef<any[]>(initialMessages)
  messagesRef.current = messages

  // Nové zprávy bez obnovení stránky: každých 8 s (jen když je karta vidět) se doptá na novější zprávy.
  useEffect(() => {
    let stopped = false
    const tick = async () => {
      if (stopped || document.hidden) return
      const last = messagesRef.current[messagesRef.current.length - 1]
      try {
        const fresh = await pollThreadMessages({ conversationId }, last?.created_at ?? null)
        if (stopped || !fresh.length) return
        const known = new Set(messagesRef.current.map((m: any) => m.id))
        const added = fresh.filter((m: any) => !known.has(m.id))
        if (!added.length) return
        setMessages((prev: any[]) => [...prev, ...added.filter((m: any) => !prev.some((p: any) => p.id === m.id))])
        // Od druhé strany → obnovit i box „Co je domluveno“ (nabídka, termíny ze serveru)
        if (added.some((m: any) => m.sender_id !== myUserId)) router.refresh()
      } catch { /* další pokus za chvíli */ }
    }
    const timer = setInterval(tick, 8000)
    const onVisible = () => { if (!document.hidden) void tick() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { stopped = true; clearInterval(timer); document.removeEventListener('visibilitychange', onVisible) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [chatImage, setChatImage] = useState<string | null>(null)
  const [imgUploading, setImgUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [estimateOpen, setEstimateOpen] = useState(false)
  // Zákazník: kdy se to hodí + rozpočet
  const [prefOpen, setPrefOpen] = useState<'time' | 'budget' | null>(null)
  const [prefFrom, setPrefFrom] = useState('')
  const [prefTo, setPrefTo] = useState('')
  const [prefPart, setPrefPart] = useState<'kdykoli' | 'rano' | 'odpoledne' | 'vecer'>('kdykoli')
  const [prefNote, setPrefNote] = useState('')
  const [budFrom, setBudFrom] = useState('')
  const [budTo, setBudTo] = useState('')
  const [prefBusy, setPrefBusy] = useState(false)
  // Ukončení jednání
  const [endOpen, setEndOpen] = useState(false)
  const [endReason, setEndReason] = useState<EndReason>('cena')
  const [endNote, setEndNote] = useState('')
  const [endBusy, setEndBusy] = useState(false)
  // Přesná adresa zákazníka (jen jeho pohled)
  const [myAddress, setMyAddress] = useState<string | null>(customerAddress)
  const [addrEdit, setAddrEdit] = useState(false)
  // Adresa provozovny: mapa až na kliknutí „Ukázat na mapě“ (po zaplacení je v objednávce rovnou s mapou)
  const [showMap, setShowMap] = useState(false)
  const [addrDraft, setAddrDraft] = useState<{ text: string; lat: number | null; lng: number | null } | null>(null)
  const [addrBusy, setAddrBusy] = useState(false)
  const [estFrom, setEstFrom] = useState('')
  const [estTo, setEstTo] = useState('')
  const [estMaterial, setEstMaterial] = useState<'with' | 'without' | null>(null)
  const [estBusy, setEstBusy] = useState(false)
  // Návrh termínu v jednání (poskytovatel) a „Vybrat a rezervovat“ (zákazník)
  const [termOpen, setTermOpen] = useState(false)
  const [termDate, setTermDate] = useState('')
  const [termClock, setTermClock] = useState('')
  const [termMinutes, setTermMinutes] = useState<number>(offerKind === 'B' ? BOOKING_POLICY.arrivalWindow.defaultMinutes : (defaultTermMinutes || 60))
  const [termBusy, setTermBusy] = useState(false)
  const [bookBusy, setBookBusy] = useState<string | null>(null)
  // Shrnutí a platba (BookingWizard) otevřené přímo v chatu
  const [wizard, setWizard] = useState<{ orderId: string; proposal: { starts_at: string; ends_at: string } | null } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length])

  const handleSend = async () => {
    const content = text.trim()
    if ((!content && !chatImage) || sending || readOnly) return
    setSending(true)
    setError(null)
    const res = await sendConversationMessage(conversationId, content, chatImage)
    if (res.success) {
      setMessages((prev) => [...prev, res.message])
      setText('')
      setChatImage(null)
    } else {
      setError(res.error)
    }
    setSending(false)
  }

  const handleChatImage = async (file: File) => {
    const isPdf = file.type === 'application/pdf'
    if (!file.type.startsWith('image/') && !isPdf) { setError('Přiložit jde fotka nebo PDF.'); return }
    if (file.size > 5 * 1024 * 1024) { setError('Soubor je příliš velký (max 5 MB).'); return }
    setImgUploading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setImgUploading(false); return }
    const ext = file.name.split('.').pop()
    const fileName = `${user.id}/chat/${Date.now()}.${ext}`
    const { data, error: upErr } = await supabase.storage.from('images').upload(fileName, file, { upsert: false, contentType: file.type })
    if (!upErr && data) {
      const { data: { publicUrl } } = supabase.storage.from('images').getPublicUrl(data.path)
      setChatImage(publicUrl)
    } else {
      console.error('[PoptavkaChat] příloha', upErr)
      setError('Přílohu se nepodařilo nahrát.')
    }
    setImgUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  // Strukturovaný odhad ceny (jen poskytovatel). Nezávazný, ukáže se i u zájemce.
  // Termín jde navrhnout zvlášť (proposeTermInChat), zákazník ho pak vybere i s poskytovatelem.
  const handleEstimate = async () => {
    if (estBusy) return
    setEstBusy(true)
    setError(null)
    const res = await sendPriceEstimate(conversationId, Number(estFrom), estTo === '' ? null : Number(estTo), estMaterial)
    if (res.success) {
      setMessages((prev) => [...prev, res.message])
      setEstimateOpen(false)
    } else {
      setError(res.error)
    }
    setEstBusy(false)
  }

  // Poslední odeslaný odhad – po otevření se předvyplní, stačí ho potvrdit nebo upravit
  const lastEstimate = [...messages].reverse().find((m) => m?.sender_id === myUserId && m?.payload?.kind === 'price_estimate')?.payload as
    { from?: number; to?: number | null; material?: 'with' | 'without' | null } | undefined
  const toggleEstimate = () => {
    if (!estimateOpen && lastEstimate?.from) {
      setEstFrom(String(lastEstimate.from))
      setEstTo(lastEstimate.to ? String(lastEstimate.to) : '')
      setEstMaterial(lastEstimate.material ?? null)
    }
    setEstimateOpen((v) => !v)
    setTermOpen(false)
  }

  // Zákazník: poslední „kdy se mi to hodí“ a rozpočet – předvyplní se, stačí upravit
  const lastOf = (kind: string, mine: boolean) =>
    [...messages].reverse().find((m) => m?.payload?.kind === kind && (mine ? m.sender_id === myUserId : m.sender_id !== myUserId))
  const togglePref = (which: 'time' | 'budget') => {
    if (prefOpen !== which) {
      const t = lastOf('time_preference', true)?.payload
      if (which === 'time' && t) { setPrefFrom(t.from ?? ''); setPrefTo(t.to ?? ''); setPrefPart(t.day_part ?? 'kdykoli'); setPrefNote(t.note ?? '') }
      const b = lastOf('budget', true)?.payload
      if (which === 'budget' && b) { setBudFrom(b.from ? String(b.from) : ''); setBudTo(b.to ? String(b.to) : '') }
    }
    setPrefOpen((v) => (v === which ? null : which))
  }
  const handlePref = async () => {
    if (prefBusy) return
    setError(null)
    setPrefBusy(true)
    const res = prefOpen === 'time'
      ? await sendCustomerPreference(conversationId, { kind: 'time_preference', from: prefFrom, to: prefTo || null, dayPart: prefPart, note: prefNote || null })
      : await sendCustomerPreference(conversationId, { kind: 'budget', from: budFrom ? Number(budFrom) : null, to: Number(budTo) })
    setPrefBusy(false)
    if (res.success) {
      setMessages((prev) => [...prev, res.message])
      setPrefOpen(null)
    } else {
      setError(res.error)
    }
  }

  const handleSaveAddress = async () => {
    if (addrBusy) return
    setError(null)
    if (!addrDraft?.text || addrDraft.lat == null || addrDraft.lng == null || !/\d/.test(addrDraft.text)) {
      setError('Vyberte prosím přesnou adresu ze seznamu (ulice a číslo).')
      return
    }
    setAddrBusy(true)
    const res = await setRequestAddressInChat(conversationId, addrDraft)
    setAddrBusy(false)
    if (res.success) { setMyAddress(addrDraft.text); setAddrEdit(false) } else setError(res.error)
  }

  // Jen ten, kdo zájem zrušil, ho může obnovit
  const declinedByMe = !!declinedBy && (declinedBy === 'provider') === isProvider
  const [resumeBusy, setResumeBusy] = useState(false)
  // Druhá strana: o obnovení jde požádat jednou po každém „Nemám zájem“
  const lastDeclineEvent = [...messages].reverse().find((m) => m?.payload?.kind === 'negotiation_ended' || m?.payload?.kind === 'resume_requested')
  const resumeRequested = lastDeclineEvent?.payload?.kind === 'resume_requested'
  const handleRequestResume = async () => {
    if (resumeBusy) return
    setResumeBusy(true)
    setError(null)
    const res = await requestResume(conversationId)
    setResumeBusy(false)
    if (res.success) { if (res.message) setMessages((prev) => [...prev, res.message]) }
    else setError(res.error)
  }
  const handleResume = async () => {
    if (resumeBusy) return
    setResumeBusy(true)
    setError(null)
    const res = await resumeNegotiation(conversationId)
    setResumeBusy(false)
    if (res.success) {
      if (res.message) setMessages((prev) => [...prev, res.message])
      router.refresh()
    } else {
      setError(res.error)
    }
  }

  const handleEnd = async () => {
    if (endBusy) return
    setEndBusy(true)
    setError(null)
    const res = await endNegotiation(conversationId, endReason, endNote || null)
    setEndBusy(false)
    if (res.success) {
      if (res.message) setMessages((prev) => [...prev, res.message])
      setEndOpen(false)
      router.refresh()
    } else {
      setError(res.error)
    }
  }

  const handleProposeTerm = async () => {
    if (termBusy) return
    setError(null)
    if (!termDate || !termClock) { setError('Vyberte den a čas.'); return }
    const start = new Date(`${termDate}T${termClock}`)
    setTermBusy(true)
    const res = await proposeTermInChat(conversationId, start.toISOString(), termMinutes)
    setTermBusy(false)
    if (res.success) {
      setMessages((prev) => [...prev, res.message])
      setTermDate(''); setTermClock(''); setTermOpen(false)
    } else {
      setError(res.error)
    }
  }

  // Zákazník: vybrat poskytovatele i termín jedním klikem → objednávka, shrnutí a platba
  const handleBookTerm = async (messageId: string) => {
    if (bookBusy) return
    setBookBusy(messageId)
    setError(null)
    const res = await selectProviderWithTerm(conversationId, messageId)
    setBookBusy(null)
    if (res.success) {
      // Shrnutí a platba se otevřou tady v chatu – zavřením se zákazník vrátí k domluvě
      const m = messages.find((x) => x.id === messageId)
      setWizard({ orderId: res.orderId, proposal: m?.payload?.starts_at ? { starts_at: m.payload.starts_at, ends_at: m.payload.ends_at } : null })
    } else {
      setError(res.error)
    }
  }

  // Souhrn „Co je domluveno“: poslední odhad (poskytovatel), rozpočet a kdy se to hodí (zákazník)
  const lastEstimateMsg = [...messages].reverse().find((m) => m?.payload?.kind === 'price_estimate')
  const lastBudgetMsg = [...messages].reverse().find((m) => m?.payload?.kind === 'budget')
  const lastTimeMsg = [...messages].reverse().find((m) => m?.payload?.kind === 'time_preference')
  const lastAvailMsg = [...messages].reverse().find((m) => m?.payload?.kind === 'provider_availability')
  // Rozpočet: poslední z chatu, jinak z poptávky; odhad nad rozpočtem → upozornit
  const budgetShown = lastBudgetMsg
    ? String(lastBudgetMsg.content).replace(/^Můj rozpočet:\s*/, '').replace(/\.$/, '')
    : rozpocetText(request.budgetFrom, request.budgetTo)
  const budgetTo: number | null = lastBudgetMsg?.payload?.to ?? request.budgetTo ?? null
  const estimateFrom: number | null = lastEstimateMsg?.payload?.from ?? null
  const overBudget = !!budgetTo && !!estimateFrom && estimateFrom > budgetTo
  const payPart = offerText ? offerText.split(' · ')[0] : null
  // Částka do tlačítka „Rezervovat · termín · 500 Kč“
  const payAmount = payPart?.match(/\d[\d\s\u00a0]*\s?Kč/)?.[0] ?? null

  // Aktuální návrhy termínu od poskytovatele (ještě je jde vybrat)
  const termProposals = messages
    // Termín navrhuje jen poskytovatel (hlídá server) – vidí ho obě strany
    .filter((m) => m?.payload?.kind === 'term_proposal')
    .filter((m) => new Date(m.payload.starts_at).getTime() > Date.now() + BOOKING_POLICY.minLeadMinutes * 60_000)
    .sort((a, b) => new Date(a.payload.starts_at).getTime() - new Date(b.payload.starts_at).getTime())
  const fmtTerm = (p: any) => {
    const d = new Date(p.starts_at)
    const den = new Intl.DateTimeFormat('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric' }).format(d)
    const od = new Intl.DateTimeFormat('cs-CZ', { hour: '2-digit', minute: '2-digit' }).format(d)
    const doo = new Intl.DateTimeFormat('cs-CZ', { hour: '2-digit', minute: '2-digit' }).format(new Date(p.ends_at))
    return p.arrival_window ? `${den} ${od}–${doo}` : `${den} ${od}`
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <Link href="/poptavky" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 lg:hidden">
        <ArrowLeft className="h-4 w-4" /> Zpět na poptávky
      </Link>

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        {/* ── LEVÝ RAIL: Moje jednání (desktop) ── */}
        <aside className="hidden lg:block">
          <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
            <p className="px-2 py-1.5 text-xs font-bold uppercase tracking-wide text-slate-400">
              {isProvider ? 'Moje jednání' : 'Poskytovatelé'}
            </p>
            <div className="space-y-0.5">
              {threads.map((t) => (
                <Link
                  key={t.conversationId}
                  href={`/poptavky/${t.requestId}/jednani/${t.conversationId}`}
                  className={`block rounded-xl px-3 py-2.5 transition ${
                    t.isCurrent ? 'bg-emerald-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <p className={`truncate text-sm font-bold ${t.isCurrent ? 'text-emerald-800' : 'text-slate-800'}`}>
                    {t.primary}
                  </p>
                  <p className="flex items-center gap-1.5 text-xs text-slate-400">
                    {t.secondary && <span className="truncate">{t.secondary}</span>}
                    {t.badge && (
                      <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">{t.badge}</span>
                    )}
                  </p>
                </Link>
              ))}
              {threads.length === 0 && (
                <p className="px-3 py-4 text-xs text-slate-400">Žádná jednání.</p>
              )}
            </div>
          </div>
        </aside>

        {/* ── HLAVNÍ SLOUPEC: poptávka → chat → Domluveno ── */}
        <div className="space-y-4">
          {/* 1) Poptávka + s kým jednáš */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{isPrivate ? (isProvider ? 'Soukromý dotaz od zákazníka' : 'Soukromý dotaz pro') : 'Poptávka'}</p>
                <h2 className="mt-1 text-lg font-black text-slate-900">{isPrivate && counterpart ? counterpart.name : request.heading}</h2>
                {isPrivate && counterpart?.subtitle && <p className="text-sm font-semibold text-slate-600">{counterpart.subtitle}</p>}
              </div>
              {!isPrivate && (
                <span className="shrink-0 rounded-full bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                  {isProvider ? 'Jednáte se zákazníkem' : `Nabídku posílá: ${otherName}`}
                </span>
              )}
              {isPrivate && counterpart?.profileUrl && (
                <Link href={counterpart.profileUrl} className="shrink-0 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100">
                  Profil
                </Link>
              )}
            </div>

            {isPrivate && counterpart ? (
              <>
                {counterpart.city && (
                  <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-slate-600"><MapPin className="h-4 w-4 text-slate-400" /> {counterpart.city}</p>
                )}
                {counterpart.about && (
                  <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">{counterpart.about}</p>
                )}
              </>
            ) : (
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-slate-600">
              {request.category && (
                <span className="inline-flex items-center gap-1.5"><Tag className="h-4 w-4 text-slate-400" /> {request.category}</span>
              )}
              <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4 text-slate-400" /> {request.city}</span>
              {request.preferredDate && (
                <span className="inline-flex items-center gap-1.5"><CalendarClock className="h-4 w-4 text-slate-400" /> {request.preferredDate}</span>
              )}
            </div>
            )}

            {request.description && !isPrivate && (
              <p className="mt-3 whitespace-pre-wrap border-t border-slate-100 pt-3 text-sm leading-relaxed text-slate-700">
                {request.description}
              </p>
            )}

            {request.photos.length > 0 && (
              <div className="mt-3 flex gap-2 overflow-x-auto">
                {request.photos.slice(0, 6).map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" className="h-16 w-16 rounded-lg border border-slate-200 object-cover" />
                  </a>
                ))}
              </div>
            )}
            {(request.inspirationPhotos?.length ?? 0) > 0 && (
              <div className="mt-3">
                <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">✨ Představa – jak by to mělo vypadat</p>
                <div className="flex gap-2 overflow-x-auto">
                  {request.inspirationPhotos!.slice(0, 8).map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="Představa zákazníka" className="h-16 w-16 rounded-lg border border-violet-200 object-cover" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {!isPrivate && (
              <Link href={`/poptavky/${requestId}`} className="mt-3 inline-block text-sm font-semibold text-emerald-700 hover:underline">
                Zobrazit detail poptávky
              </Link>
            )}
          </div>

          {/* 2) Chat */}
          <section className="flex min-h-[60vh] flex-col rounded-2xl border border-slate-200 bg-white shadow-sm">
          {/* Hlavička chatu (nástroje domluvy jsou dole nad polem pro zprávu) */}
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
            <p className="truncate text-sm font-bold text-slate-900">
              {isProvider ? 'Chat se zákazníkem' : `Chat s ${otherName}`}
            </p>
          </div>

          {/* Co je domluveno – poslední hodnota každé položky z chatu */}
          {!orderId && (
            <div className="mx-5 mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <p className="mb-2.5 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
                <ClipboardList className="h-3.5 w-3.5" /> Co je domluveno
              </p>
              <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
                <dt className="text-slate-500">Místo konání</dt>
                {place?.atProvider ? (
                  <dd className="text-slate-900">
                    <span className="font-semibold">U poskytovatele</span>{place.address ? `: ${place.address}` : ''}
                    {place.lat != null && place.lng != null && (
                      <button type="button" onClick={() => setShowMap((v) => !v)} className="ml-2 text-xs font-semibold text-emerald-700 underline hover:text-emerald-800">
                        {showMap ? 'Skrýt mapu' : 'Ukázat na mapě'}
                      </button>
                    )}
                    {isProvider && placeEditor && <span className="ml-2 inline-block align-middle">{placeEditor}</span>}
                    {place.pref === 'u_zakaznika' && !isPrivate && (
                      <span className="block text-xs text-amber-700">{isProvider ? 'Zákazník by to raději měl u sebe.' : 'Chtěli jste to u sebe – domluvte se, nebo zvolte jiného poskytovatele.'}</span>
                    )}
                    {showMap && place.lat != null && place.lng != null && (
                      <div className="mt-2 max-w-md overflow-hidden rounded-lg">
                        <ServiceMap lat={place.lat} lng={place.lng} label={place.address ?? 'Místo konání'} />
                      </div>
                    )}
                  </dd>
                ) : (
                  <dd className="text-slate-900">
                    <span className="font-semibold">{isProvider ? 'U zákazníka' : 'U vás'}</span>
                    {!isProvider && myAddress ? `: ${myAddress}` : (!isPrivate || cityKnown) ? `: ${request.city}` : ''}
                    {distanceKm != null && (!isPrivate || cityKnown) && <span className="text-slate-500"> · ≈ {distanceKm} km {isProvider ? 'od vás' : 'od poskytovatele'}</span>}
                    {isProvider && placeEditor && <span className="ml-2 inline-block align-middle">{placeEditor}</span>}
                    {place?.pref === 'u_poskytovatele' && !isPrivate && (
                      <span className="block text-xs text-amber-700">{isProvider ? 'Zákazník by raději přišel k vám.' : 'Chtěli jste přijít k poskytovateli – tahle nabídka je u vás.'}</span>
                    )}
                    {isProvider ? (
                      <span className="block text-xs text-slate-500">
                        {isPrivate ? 'Adresu zákazník doplní před platbou, ' : 'Přesnou adresu zákazník zadá před platbou, '}uvidíte ji po potvrzení rezervace (u termínu od vás hned po zaplacení).
                      </span>
                    ) : myAddress ? (
                      <span className="block text-xs text-slate-500">
                        Poskytovatel zatím vidí jen obec, ulici a číslo uvidí po zaplacení.{' '}
                        {!orderId && !readOnly && (
                          <button type="button" onClick={() => setAddrEdit(true)} className="font-semibold text-emerald-700 underline">Změnit</button>
                        )}
                      </span>
                    ) : (
                      <span className="mt-1 block rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
                        Doplňte vaši adresu – poskytovatel ji dostane, jakmile zaplatíte.{' '}
                        {!orderId && !readOnly && (
                          <button type="button" onClick={() => setAddrEdit(true)} className="font-bold underline">Doplnit adresu</button>
                        )}
                      </span>
                    )}
                    {addrEdit && !isProvider && (
                      <div className="mt-2 max-w-md">
                        <AddressInput
                          defaultValue={myAddress ?? (isPrivate ? '' : `${request.city}, `)}
                          placeholder="Ulice a číslo – vyberte ze seznamu…"
                          onPick={(a) => setAddrDraft({ text: a.address, lat: a.lat, lng: a.lng })}
                          onFreeText={(t) => setAddrDraft({ text: t, lat: null, lng: null })}
                        />
                        <div className="mt-1.5 flex gap-2">
                          <button type="button" onClick={handleSaveAddress} disabled={addrBusy}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-600 disabled:opacity-50">
                            {addrBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Uložit adresu
                          </button>
                          <button type="button" onClick={() => setAddrEdit(false)} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100">Zrušit</button>
                        </div>
                      </div>
                    )}
                  </dd>
                )}
                <dt className="text-slate-500">Nabídka</dt>
                <dd className={offerText ? 'font-semibold text-slate-900' : 'text-amber-700'}>
                  {offerText
                    ? <>{offerText} <span className="font-normal text-slate-500">· platí se přes Propojo při rezervaci</span></>
                    : isProvider ? 'Doplňte nabídku – kolik zákazník zaplatí přes Propojo. Bez ní nejde rezervovat.' : 'Poskytovatel zatím neuvedl, kolik se platí přes Propojo – rezervovat půjde, až ji doplní.'}
                  {offerEditor && <div className="mt-1.5">{offerEditor}</div>}
                </dd>
                <dt className="text-slate-500">Odhad ceny</dt>
                <dd className={lastEstimateMsg ? 'text-slate-900' : 'text-slate-400'}>
                  {lastEstimateMsg ? String(lastEstimateMsg.content).replace(/^Předběžný odhad ceny:\s*/, '') : 'zatím neposlán'}
                  {isProvider && !readOnly && !declinedBy && (
                    <button type="button" onClick={toggleEstimate} className="ml-2 text-xs font-semibold text-emerald-700 underline hover:text-emerald-800">{lastEstimate ? 'Upravit' : 'Poslat odhad'}</button>
                  )}
                  {overBudget && (
                    <span className="mt-0.5 block text-xs font-semibold text-amber-700">
                      {isProvider ? 'Odhad je nad rozpočtem zákazníka – domluvte se ještě před rezervací.' : 'Odhad je nad vaším rozpočtem – domluvte se ještě před rezervací.'}
                    </span>
                  )}
                </dd>
                <dt className="text-slate-500">{isProvider ? 'Rozpočet zákazníka' : 'Váš rozpočet'}</dt>
                <dd className={budgetShown ? 'text-slate-900' : 'text-slate-400'}>
                  {budgetShown ?? (isProvider ? 'neuveden' : 'nepovinné')}
                  {!isProvider && !readOnly && !declinedBy && (
                    <button type="button" onClick={() => togglePref('budget')} className="ml-2 text-xs font-semibold text-emerald-700 underline hover:text-emerald-800">{budgetShown ? 'Změnit' : 'Doplnit'}</button>
                  )}
                </dd>
                <dt className="text-slate-500">Kdy se hodí</dt>
                <dd className={lastTimeMsg ? 'text-slate-900' : 'text-slate-400'}>
                  {lastTimeMsg ? String(lastTimeMsg.content).replace(/^Hodí se mi:\s*/, '').replace(/\.$/, '') : request.preferredDate ?? 'neuvedeno'}
                  {!isProvider && !readOnly && !declinedBy && (
                    <button type="button" onClick={() => togglePref('time')} className="ml-2 text-xs font-semibold text-emerald-700 underline hover:text-emerald-800">{lastTimeMsg ? 'Změnit' : 'Doplnit'}</button>
                  )}
                </dd>
                {lastAvailMsg && (
                  <>
                    <dt className="text-slate-500">Poskytovatel může</dt>
                    <dd className="text-slate-900">{String(lastAvailMsg.content).replace(/^Mohu:\s*/, '').replace(/\.\.$/, '.')}</dd>
                  </>
                )}
                <dt className="text-slate-500">Navržené termíny</dt>
                <dd>
                  {isProvider && !readOnly && !declinedBy && (
                    offerKind
                      ? <button type="button" onClick={() => { setTermOpen((v) => !v); setEstimateOpen(false) }} className="mb-1 inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 transition hover:bg-amber-100"><CalendarDays className="h-3.5 w-3.5" /> Navrhnout termín</button>
                      : <span className="mb-1 block text-xs text-amber-700">Termín navrhnete, až doplníte nabídku.</span>
                  )}
                  {termProposals.length === 0 ? (
                    <span className="block text-slate-400">{isProvider ? 'zatím žádný' : 'zatím žádný – jakmile poskytovatel navrhne termín, objeví se tu tlačítko Rezervovat a zaplatit'}</span>
                  ) : canSelect ? (
                    <div className="space-y-1.5">
                      {termProposals.map((m) => (
                        <button
                          key={m.id}
                          onClick={() => handleBookTerm(m.id)}
                          disabled={!!bookBusy}
                          className="flex w-full items-center justify-between gap-3 rounded-xl bg-emerald-500 px-3.5 py-2.5 text-left text-sm font-bold text-white transition hover:bg-emerald-600 disabled:opacity-60"
                        >
                          <span className="flex items-center gap-2">
                            {bookBusy === m.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarDays className="h-4 w-4" />}
                            Rezervovat · {fmtTerm(m.payload)}{payAmount ? ` · ${payAmount}` : ''}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <span className="text-slate-900">{termProposals.map((m) => fmtTerm(m.payload)).join(', ')}</span>
                  )}
                </dd>
              </dl>
              {/* Formuláře domluvy přímo v boxu (15. 10. 2026) – pod boxem už jen chat */}
              {!declinedBy && (
                <div className="mt-3 space-y-2 empty:hidden">
                  {/* Composer zákazníka: kdy se to hodí / rozpočet */}
                  {prefOpen && !isProvider && !readOnly && (
                    <div className="mb-2 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
                      {prefOpen === 'time' ? (
                        <>
                          <p className="mb-2 text-xs font-semibold text-slate-600">Kdy se vám to hodí</p>
                          <div className="flex flex-wrap items-center gap-2">
                            <input type="date" value={prefFrom} onChange={(e) => setPrefFrom(e.target.value)}
                              className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-emerald-400" aria-label="Od" />
                            <span className="text-slate-400">–</span>
                            <input type="date" value={prefTo} min={prefFrom || undefined} onChange={(e) => setPrefTo(e.target.value)}
                              className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-emerald-400" aria-label="Do (nepovinné)" />
                            <select value={prefPart} onChange={(e) => setPrefPart(e.target.value as typeof prefPart)}
                              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-600 outline-none focus:border-emerald-400">
                              <option value="kdykoli">kdykoli</option>
                              <option value="rano">ráno (8–12)</option>
                              <option value="odpoledne">odpoledne (12–17)</option>
                              <option value="vecer">večer (17–20)</option>
                            </select>
                          </div>
                          <input value={prefNote} onChange={(e) => setPrefNote(e.target.value)} maxLength={200}
                            placeholder="Poznámka (nepovinné), např. ne ve středu"
                            className="mt-2 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-emerald-400" />
                        </>
                      ) : (
                        <>
                          <p className="mb-2 text-xs font-semibold text-slate-600">Rozpočet na zakázku (nezávazný)</p>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <input type="number" min={1} value={budFrom} onChange={(e) => setBudFrom(e.target.value)} placeholder="od (nepovinné)"
                              className="w-32 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-emerald-400" />
                            <span className="text-slate-400">–</span>
                            <input type="number" min={1} value={budTo} onChange={(e) => setBudTo(e.target.value)} placeholder="do"
                              className="w-28 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-emerald-400" />
                            <span className="text-sm text-slate-500">Kč</span>
                          </div>
                        </>
                      )}
                      <button
                        onClick={handlePref}
                        disabled={prefBusy || (prefOpen === 'time' ? !prefFrom : !budTo)}
                        className="mt-2 inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-600 disabled:opacity-50"
                      >
                        {prefBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Poslat
                      </button>
                    </div>
                  )}

                  {/* Composer návrhu termínu (jen poskytovatel) */}
                  {termOpen && isProvider && !readOnly && offerKind && (
                    <div className="mb-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                      <p className="mb-2 text-xs font-semibold text-slate-600">
                        Navržený termín je pro vás závazný: zákazník ho může rovnou potvrdit zaplacením a tím vznikne rezervace.
                        {' '}Když adresa zákazníka sedí s obcí poptávky, potvrdí se automaticky – jinak ji potvrdíte vy.
                      </p>
                      <div className="flex flex-wrap items-end gap-2">
                        <input type="date" value={termDate} onChange={(e) => setTermDate(e.target.value)}
                          className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-amber-400" />
                        <input type="time" step={300} value={termClock} onChange={(e) => setTermClock(e.target.value)}
                          className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-amber-400" />
                        {offerKind === 'B' ? (
                          <select value={termMinutes} onChange={(e) => setTermMinutes(Number(e.target.value))}
                            className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-amber-400">
                            {BOOKING_POLICY.arrivalWindow.optionsMinutes.map((m) => (
                              <option key={m} value={m}>přijedu v rozmezí {m < 60 ? `${m} min` : m % 60 === 0 ? `${m / 60} h` : `${Math.floor(m / 60)} h ${m % 60} min`}</option>
                            ))}
                          </select>
                        ) : (
                          <label className="flex items-center gap-1.5 text-sm text-slate-600">
                            <input type="number" min={5} max={720} step={5} value={termMinutes} onChange={(e) => setTermMinutes(Number(e.target.value))}
                              className="w-20 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-amber-400" />
                            min
                          </label>
                        )}
                        <button
                          onClick={handleProposeTerm}
                          disabled={termBusy || !termDate || !termClock}
                          className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-amber-600 disabled:opacity-50"
                        >
                          {termBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Poslat návrh
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Composer odhadu ceny (jen poskytovatel) */}
                  {estimateOpen && isProvider && !readOnly && (
                    <div className="mb-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="mb-2 text-xs font-semibold text-slate-600">
                        Nezávazný odhad ceny{lastEstimate ? ' – předvyplněný posledním odhadem, potvrďte nebo upravte' : ''}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number" min={0} value={estFrom} onChange={(e) => setEstFrom(e.target.value)}
                            placeholder="od" className="w-24 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-emerald-400"
                          />
                          <span className="text-slate-400">–</span>
                          <input
                            type="number" min={0} value={estTo} onChange={(e) => setEstTo(e.target.value)}
                            placeholder="do (nepovinné)" className="w-32 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-emerald-400"
                          />
                          <span className="text-sm text-slate-500">Kč</span>
                        </div>
                        <select
                          value={estMaterial ?? ''}
                          onChange={(e) => setEstMaterial(e.target.value === 'with' ? 'with' : e.target.value === 'without' ? 'without' : null)}
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-600 outline-none focus:border-emerald-400"
                          aria-label="Materiál"
                        >
                          <option value="">materiál neuvádět</option>
                          <option value="with">včetně materiálu</option>
                          <option value="without">bez materiálu</option>
                        </select>
                        <button
                          onClick={handleEstimate}
                          disabled={estBusy || !estFrom}
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-600 disabled:opacity-50"
                        >
                          {estBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Coins className="h-3.5 w-3.5" />} Odeslat odhad
                        </button>
                      </div>
                    </div>
                  )}

                </div>
              )}
              <p className="mt-3 border-t border-slate-200 pt-2.5 text-xs leading-relaxed text-slate-500">
                {isProvider
                  ? `Zákazník vybere termín, vyplní adresu a zaplatí – tím vznikne rezervace. Přesnou adresu a kontakt uvidíte po potvrzení rezervace.${payPart ? ` Přes Propojo zákazník platí jen ${payPart.charAt(0).toLowerCase()}${payPart.slice(1)}; odhad i rozpočet jsou nezávazné a cenu zakázky si domluvíte spolu.` : ''}`
                  : `Až bude všechno sedět, vyberte termín. Následuje shrnutí s adresou a kontaktem poskytovatele a platba. Ostatní jednání se uzavřou až po zaplacení.${payPart ? ` Přes Propojo zaplatíte jen ${payPart.charAt(0).toLowerCase()}${payPart.slice(1)} – odhad i rozpočet jsou nezávazné, cenu zakázky si domluvíte s poskytovatelem.` : ''}`}
              </p>
            </div>
          )}

          {/* Vybráno → odkaz na objednávku */}
          {orderId && (
            <div className="mx-5 mt-4 flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              <span className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Vznikla rezervace. Psát můžete dál tady – termín, adresu a platbu najdete v objednávce.</span>
              <Link href={`/dashboard/objednavky/${orderId}`} className="shrink-0 font-bold underline">Otevřít objednávku</Link>
            </div>
          )}

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center text-slate-400">
                <MessagesSquare className="mb-2 h-8 w-8" />
                <p className="text-sm">Zatím žádné zprávy. {isProvider ? 'Napište zákazníkovi.' : 'Napište poskytovateli.'}</p>
              </div>
            ) : (
              <ChatThread messages={messages as any} myUserId={myUserId} senderNames={senderNames} />
            )}
          </div>

          {/* Vstup / zámek */}
          {readOnly ? (
            orderId ? (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-4">
                <p className="text-sm text-slate-500">Vznikla rezervace – chat i všechny zprávy pokračují u ní.</p>
                <Link
                  href={`/dashboard/objednavky/${orderId}`}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-600"
                >
                  Pokračovat v chatu u rezervace <ArrowLeft className="h-4 w-4 rotate-180" />
                </Link>
              </div>
            ) : (
              <div className="flex items-center gap-2 border-t border-slate-100 px-5 py-4 text-sm text-slate-400">
                <Lock className="h-4 w-4" /> Tohle jednání je uzavřené.
              </div>
            )
          ) : (
            <div className="border-t border-slate-100 p-3">
              {/* Nemám zájem → chat dál otevřený, jen bez termínů a rezervace */}
              {!orderId && declinedBy && (
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <span>
                    {declinedByMe
                      ? 'Dali jste vědět, že teď nemáte zájem. Psát si můžete dál.'
                      : `${isProvider ? 'Zákazník' : 'Poskytovatel'} teď nemá zájem. Psát si můžete dál, nebo požádejte o obnovení jednání.`}
                  </span>
                  {declinedByMe ? (
                    <button onClick={handleResume} disabled={resumeBusy}
                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-2.5 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-600 disabled:opacity-50">
                      {resumeBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Pokračovat v jednání
                    </button>
                  ) : resumeRequested ? (
                    <span className="font-semibold text-amber-800">Žádost o obnovení odeslána</span>
                  ) : (
                    <button onClick={handleRequestResume} disabled={resumeBusy}
                      className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-xs font-bold text-amber-900 transition hover:bg-amber-100 disabled:opacity-50">
                      {resumeBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Požádat o obnovení
                    </button>
                  )}
                </div>
              )}
              {/* Pod boxem už jen chat (zprávy, fotky, PDF); domluva se vyplňuje v boxu nahoře */}
              {!orderId && !declinedBy && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  <button
                    onClick={() => { setEndOpen(true); setError(null) }}
                    className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                  >
                    <X className="h-3.5 w-3.5" /> Nemám zájem
                  </button>
                </div>
              )}
              {chatImage && (
                <div className="mb-2 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-1.5">
                  {/\.pdf($|\?)/i.test(chatImage)
                    ? <span className="inline-flex items-center gap-1.5 px-1.5 text-sm text-slate-700"><FileText className="h-4 w-4 text-red-500" /> PDF příloha</span>
                    // eslint-disable-next-line @next/next/no-img-element
                    : <img src={chatImage} alt="Náhled" className="h-12 w-12 rounded object-cover" />}
                  <button onClick={() => setChatImage(null)} className="flex h-6 w-6 items-center justify-center rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-600">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
              {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
              <div className="flex items-center gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleChatImage(f) }}
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={imgUploading || sending}
                  title="Přiložit fotku nebo PDF"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:opacity-40"
                >
                  {imgUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                </button>
                <input
                  ref={inputRef}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                  placeholder="Napište zprávu…"
                  className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                />
                <button
                  onClick={handleSend}
                  disabled={sending || (!text.trim() && !chatImage)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-white transition hover:bg-emerald-600 disabled:opacity-40"
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
              {!orderId && <p className="mt-2 flex items-center gap-1.5 px-1 text-[11px] text-slate-400">
                <Lock className="h-3 w-3" /> {isProvider
                  ? 'Adresu a kontakt zákazníka uvidíte po potvrzení rezervace.'
                  : 'Kontakt poskytovatele uvidíte ve shrnutí před platbou.'}
              </p>}
            </div>
          )}
          </section>

          {!isProvider && !canSelect && !orderId && !hasServiceForOrder && (
            <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
              Poskytovatel zatím neuvedl, kolik se platí přes Propojo. Napište mu, ať nabídku doplní.
            </p>
          )}
        </div>
      </div>

      {wizard && (
        <BookingWizard
          orderId={wizard.orderId}
          proposal={wizard.proposal}
          onClose={() => { setWizard(null); router.refresh() }}
        />
      )}

      {/* Nemám zájem – obě strany, s důvodem; druhá strana ho uvidí v chatu, chat zůstává otevřený */}
      {endOpen && (
        <div className="fixed inset-0 z-[9990] flex items-end justify-center sm:items-center">
          <button aria-label="Zavřít" onClick={() => !endBusy && setEndOpen(false)} className="absolute inset-0 bg-slate-950/40" />
          <div className="relative w-full max-w-md rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl">
            <h2 className="text-lg font-black text-slate-900">Nemáte zájem?</h2>
            <p className="mt-1 text-sm text-slate-600">
              {isProvider
                ? 'Zákazník uvidí, že teď nemáte zájem, a proč. Chat zůstane otevřený – když se domluvíte jinak, jednání obnovíte jedním klikem.'
                : `${otherName} uvidí, že teď nemáte zájem, a proč. Chat zůstane otevřený a s ostatními poskytovateli jednáte dál. Když si to rozmyslíte, jednání obnovíte jedním klikem.`}
            </p>
            <div className="mt-4 space-y-2">
              {([['cena', 'Nesedí cena'], ['termin', 'Nesedí termín'], ['jine', 'Jiný důvod']] as const).map(([v, label]) => (
                <label key={v} className={`flex cursor-pointer items-center gap-2.5 rounded-xl border-2 px-3.5 py-2.5 text-sm ${endReason === v ? 'border-red-300 bg-red-50' : 'border-slate-200'}`}>
                  <input type="radio" name="end-reason" checked={endReason === v} onChange={() => setEndReason(v)} className="accent-red-600" />
                  {label}
                </label>
              ))}
            </div>
            <textarea
              value={endNote}
              onChange={(e) => setEndNote(e.target.value)}
              rows={2}
              maxLength={300}
              placeholder="Poznámka pro druhou stranu (nepovinné)"
              className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-red-300"
            />
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            <div className="mt-4 flex flex-col gap-2">
              <button
                onClick={handleEnd}
                disabled={endBusy}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-red-700 disabled:opacity-60"
              >
                {endBusy && <Loader2 className="h-4 w-4 animate-spin" />} Nemám zájem
              </button>
              <button
                onClick={() => setEndOpen(false)}
                disabled={endBusy}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                Zpět do chatu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}