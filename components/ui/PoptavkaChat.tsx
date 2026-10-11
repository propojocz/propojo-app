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
  Coins, CheckCircle2, MessagesSquare, CalendarDays, Wallet, ClipboardList,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { sendConversationMessage, sendPriceEstimate, proposeTermInChat, selectProviderWithTerm, sendCustomerPreference } from '@/lib/actions/conversation-chat'
import { BOOKING_POLICY } from '@/lib/booking/policy'
import { rozpocetText } from '@/lib/format'
import ChatThread from '@/components/ui/ChatThread'

export type ThreadItem = {
  conversationId: string
  requestId: string
  primary: string
  secondary: string
  badge: string | null
  isCurrent: boolean
}

type RequestCtx = {
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
  otherName, distanceKm = null, draftOrderId = null, request, threads, initialMessages, myUserId, senderNames,
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
  request: RequestCtx
  threads: ThreadItem[]
  initialMessages: any[]
  myUserId: string
  senderNames: Record<string, string>
}) {
  const router = useRouter()
  const [messages, setMessages] = useState<any[]>(initialMessages)
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
  const [estFrom, setEstFrom] = useState('')
  const [estTo, setEstTo] = useState('')
  const [estMaterial, setEstMaterial] = useState<'with' | 'without' | null>(null)
  const [estBusy, setEstBusy] = useState(false)
  // Návrh termínu v jednání (poskytovatel) a „Vybrat a rezervovat“ (zákazník)
  const [termOpen, setTermOpen] = useState(false)
  const [termDate, setTermDate] = useState('')
  const [termClock, setTermClock] = useState('')
  const [termMinutes, setTermMinutes] = useState<number>(offerKind === 'B' ? BOOKING_POLICY.arrivalWindow.defaultMinutes : 60)
  const [termBusy, setTermBusy] = useState(false)
  const [bookBusy, setBookBusy] = useState<string | null>(null)
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
    if (res.success) {
      router.push(`/dashboard/objednavky/${res.orderId}${res.startsAt ? `?rezervovat=${encodeURIComponent(res.startsAt)}` : ''}`)
    } else {
      setError(res.error)
      setBookBusy(null)
    }
  }

  // Souhrn „Co je domluveno“: poslední odhad (poskytovatel), rozpočet a kdy se to hodí (zákazník)
  const lastEstimateMsg = [...messages].reverse().find((m) => m?.payload?.kind === 'price_estimate')
  const lastBudgetMsg = [...messages].reverse().find((m) => m?.payload?.kind === 'budget')
  const lastTimeMsg = [...messages].reverse().find((m) => m?.payload?.kind === 'time_preference')
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
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Poptávka</p>
                <h2 className="mt-1 text-lg font-black text-slate-900">{request.heading}</h2>
              </div>
              <span className="shrink-0 rounded-full bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                {isProvider ? 'Jednáte se zákazníkem' : `Nabídku posílá: ${otherName}`}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-slate-600">
              {request.category && (
                <span className="inline-flex items-center gap-1.5"><Tag className="h-4 w-4 text-slate-400" /> {request.category}</span>
              )}
              <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4 text-slate-400" /> {request.city}</span>
              {request.preferredDate && (
                <span className="inline-flex items-center gap-1.5"><CalendarClock className="h-4 w-4 text-slate-400" /> {request.preferredDate}</span>
              )}
            </div>

            {request.description && (
              <p className="mt-3 whitespace-pre-wrap border-t border-slate-100 pt-3 text-sm leading-relaxed text-slate-700">
                {request.description}
              </p>
            )}

            {request.photos.length > 0 && (
              <div className="mt-3 flex gap-2 overflow-x-auto">
                {request.photos.slice(0, 6).map((url, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={url} alt="" className="h-16 w-16 shrink-0 rounded-lg border border-slate-200 object-cover" />
                ))}
              </div>
            )}

            <Link href={`/poptavky/${requestId}`} className="mt-3 inline-block text-sm font-semibold text-emerald-700 hover:underline">
              Zobrazit detail poptávky
            </Link>
          </div>

          {/* 2) Chat */}
          <section className="flex min-h-[60vh] flex-col rounded-2xl border border-slate-200 bg-white shadow-sm">
          {/* Hlavička chatu (nástroje domluvy jsou dole nad polem pro zprávu) */}
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
            <p className="truncate text-sm font-bold text-slate-900">
              {isProvider ? 'Chat se zákazníkem' : `Chat s ${otherName}`}
            </p>
          </div>

          {draftOrderId && !isProvider && (
            <Link
              href={`/dashboard/objednavky/${draftOrderId}`}
              className="mx-5 mt-4 flex items-center justify-between gap-2 rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900 transition hover:bg-amber-100"
            >
              Máte vybraný termín – dokončete rezervaci (adresa a platba)
              <ArrowLeft className="h-4 w-4 shrink-0 rotate-180" />
            </Link>
          )}

          {/* Co je domluveno – poslední hodnota každé položky z chatu */}
          {!orderId && (
            <div className="mx-5 mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <p className="mb-2.5 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
                <ClipboardList className="h-3.5 w-3.5" /> Co je domluveno
              </p>
              <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
                <dt className="text-slate-500">Místo</dt>
                <dd className="text-slate-900">
                  {request.city}
                  {distanceKm != null && <span className="text-slate-500"> · ≈ {distanceKm} km {isProvider ? 'od vás' : 'od poskytovatele'}</span>}
                  <span className="block text-xs text-slate-500">
                    {isProvider
                      ? 'Přesnou adresu zákazník zadá před platbou, uvidíte ji po potvrzení rezervace.'
                      : 'Přesnou adresu zadáte ve shrnutí před platbou. Poskytovatel ji uvidí po potvrzení rezervace.'}
                  </span>
                </dd>
                <dt className="text-slate-500">Nabídka</dt>
                <dd className={offerText ? 'font-semibold text-slate-900' : 'text-amber-700'}>
                  {offerText
                    ? <>{offerText} <span className="font-normal text-slate-500">· platí se přes Propojo při rezervaci</span></>
                    : isProvider ? 'Doplňte u poptávky přes „Upravit nabídku“, kolik zákazník zaplatí přes Propojo.' : 'Poskytovatel zatím neuvedl, kolik se platí přes Propojo.'}
                </dd>
                <dt className="text-slate-500">Odhad ceny</dt>
                <dd className={lastEstimateMsg ? 'text-slate-900' : 'text-slate-400'}>
                  {lastEstimateMsg ? String(lastEstimateMsg.content).replace(/^Předběžný odhad ceny:\s*/, '') : 'zatím neposlán'}
                  {overBudget && (
                    <span className="mt-0.5 block text-xs font-semibold text-amber-700">
                      {isProvider ? 'Odhad je nad rozpočtem zákazníka – domluvte se ještě před rezervací.' : 'Odhad je nad vaším rozpočtem – domluvte se ještě před rezervací.'}
                    </span>
                  )}
                </dd>
                <dt className="text-slate-500">Rozpočet zákazníka</dt>
                <dd className={budgetShown ? 'text-slate-900' : 'text-slate-400'}>
                  {budgetShown ?? 'neuveden'}
                </dd>
                <dt className="text-slate-500">Kdy se hodí</dt>
                <dd className={lastTimeMsg ? 'text-slate-900' : 'text-slate-400'}>
                  {lastTimeMsg ? String(lastTimeMsg.content).replace(/^Hodí se mi:\s*/, '').replace(/\.$/, '') : request.preferredDate ?? 'neuvedeno'}
                </dd>
                <dt className="text-slate-500">Navržené termíny</dt>
                <dd>
                  {termProposals.length === 0 ? (
                    <span className="text-slate-400">{isProvider ? 'zatím žádný – navrhněte termín' : 'zatím žádný – poskytovatel ho navrhne'}</span>
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
              <span className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Poskytovatel byl vybrán — jednání pokračuje jako objednávka.</span>
              <Link href={`/dashboard/objednavky/${orderId}`} className="shrink-0 font-bold underline">Přejít na objednávku</Link>
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
            <div className="flex items-center gap-2 border-t border-slate-100 px-5 py-4 text-sm text-slate-400">
              <Lock className="h-4 w-4" />
              {orderId ? 'Konverzace pokračuje v objednávce.' : 'Tohle jednání je uzavřené.'}
            </div>
          ) : (
            <div className="border-t border-slate-100 p-3">
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

              {/* Nástroje domluvy – přímo nad polem pro zprávu */}
              {(isProvider || !orderId) && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {isProvider && offerKind && (
                    <button
                      onClick={() => { setTermOpen((v) => !v); setEstimateOpen(false) }}
                      className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-100"
                    >
                      <CalendarDays className="h-3.5 w-3.5" /> Navrhnout termín
                    </button>
                  )}
                  {isProvider && (
                    <button
                      onClick={toggleEstimate}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                    >
                      <Coins className="h-3.5 w-3.5" /> {lastEstimate ? 'Upravit odhad ceny' : 'Odhad ceny'}
                    </button>
                  )}
                  {!isProvider && (
                    <>
                      <button
                        onClick={() => togglePref('time')}
                        className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100"
                      >
                        <CalendarDays className="h-3.5 w-3.5" /> Kdy se mi to hodí
                      </button>
                      <button
                        onClick={() => togglePref('budget')}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                      >
                        <Wallet className="h-3.5 w-3.5" /> Rozpočet
                      </button>
                    </>
                  )}
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
              <p className="mt-2 flex items-center gap-1.5 px-1 text-[11px] text-slate-400">
                <Lock className="h-3 w-3" /> {isProvider
                  ? 'Adresu a kontakt zákazníka uvidíte po potvrzení rezervace.'
                  : 'Kontakt poskytovatele uvidíte ve shrnutí před platbou.'}
              </p>
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

    </div>
  )
}