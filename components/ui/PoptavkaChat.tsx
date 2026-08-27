'use client'
// components/ui/PoptavkaChat.tsx
// Konverzace jednání o poptávce. Desktop: vlevo Moje jednání, uprostřed chat
// (stejný ChatThread jako u objednávek), vpravo kontext poptávky. Mobil: jen chat
// se zpětným odkazem, rail je skrytý (seznam je na /poptavky).
//
// Před výběrem poskytovatele se objednávka NEVYTVÁŘÍ — píše se přes
// sendConversationMessage (conversation_id). Zákazník může poskytovatele vybrat
// odsud; teprve tím vznikne objednávka a přejde se do standardního order flow.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Send, Loader2, ArrowLeft, MapPin, CalendarClock, Tag, Lock, ImagePlus, X,
  Tags, Coins, Info, CheckCircle2, MessagesSquare,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { sendConversationMessage, sendPriceEstimate } from '@/lib/actions/conversation-chat'
import { selectProvider } from '@/lib/actions/requests'
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
  heading: string
  category: string | null
  city: string
  description: string
  preferredDate: string | null
  photos: string[]
}

export default function PoptavkaChat({
  conversationId, requestId, responseId,
  isProvider, readOnly, orderId, canSelect, hasServiceForOrder,
  otherName, request, threads, initialMessages, myUserId, senderNames,
}: {
  conversationId: string
  requestId: string
  responseId: string
  isProvider: boolean
  readOnly: boolean
  orderId: string | null
  canSelect: boolean
  hasServiceForOrder: boolean
  otherName: string
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
  const [selectBusy, setSelectBusy] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [estimateOpen, setEstimateOpen] = useState(false)
  const [estFrom, setEstFrom] = useState('')
  const [estTo, setEstTo] = useState('')
  const [estBusy, setEstBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length])

  const handleSend = async () => {
    const content = text.trim()
    if (!content || sending || readOnly) return
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
    if (!file.type.startsWith('image/')) return
    if (file.size > 5 * 1024 * 1024) { alert('Obrázek je příliš velký (max 5 MB).'); return }
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
    }
    setImgUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  // Strukturovaný odhad ceny (jen poskytovatel). Nezávazný, ukáže se i u zájemce.
  // Termín se v jednání NENAVRHUJE — patří až do objednávky po výběru.
  const handleEstimate = async () => {
    if (estBusy) return
    setEstBusy(true)
    setError(null)
    const res = await sendPriceEstimate(conversationId, Number(estFrom), estTo === '' ? null : Number(estTo))
    if (res.success) {
      setMessages((prev) => [...prev, res.message])
      setEstFrom(''); setEstTo(''); setEstimateOpen(false)
    } else {
      setError(res.error)
    }
    setEstBusy(false)
  }

  const handleSelect = async () => {
    if (selectBusy) return
    setSelectBusy(true)
    setError(null)
    const res = await selectProvider(requestId, responseId)
    if (res.success && res.id) {
      router.push(`/dashboard/objednavky/${res.id}`)
    } else {
      setError(res.success ? 'Objednávku se nepodařilo vytvořit.' : res.error)
      setSelectBusy(false)
      setConfirmOpen(false)
    }
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
          {/* Hlavička chatu + odeslat odhad (jen poskytovatel, jen když se dá psát) */}
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
            <p className="truncate text-sm font-bold text-slate-900">
              {isProvider ? 'Chat se zákazníkem' : `Chat s ${otherName}`}
            </p>
            {isProvider && !readOnly && (
              <button
                onClick={() => setEstimateOpen((v) => !v)}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                <Coins className="h-3.5 w-3.5" /> Poslat odhad ceny
              </button>
            )}
          </div>

          {/* Vybráno → odkaz na objednávku */}
          {orderId && (
            <div className="mx-5 mt-4 flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              <span className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Poskytovatel byl vybrán — jednání pokračuje jako objednávka.</span>
              <Link href={`/dashboard/objednavky/${orderId}`} className="shrink-0 font-bold underline">Přejít na objednávku</Link>
            </div>
          )}

          {/* Předběžná domluva — jasně: zatím to není objednávka. */}
          {!orderId && !readOnly && (
            <div className="mx-5 mt-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-800">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <b className="block text-[13px]">Předběžná domluva</b>
                {isProvider
                  ? 'Zákazník si zatím vybírá. Domluvte se rámcově a klidně pošlete nezávazný odhad ceny. Závazný termín i platba vzniknou, až vás zákazník vybere.'
                  : 'Tohle zatím není objednávka — cena ani termín nejsou závazné. Až si poskytovatele vyberete, potvrdíte termín a platbu v objednávce.'}
              </div>
            </div>
          )}

          {/* Composer odhadu ceny (jen poskytovatel) */}
          {estimateOpen && isProvider && !readOnly && (
            <div className="mx-5 mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="mb-2 text-xs font-semibold text-slate-600">Nezávazný odhad ceny</p>
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
              {chatImage && (
                <div className="mb-2 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-1.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={chatImage} alt="Náhled" className="h-12 w-12 rounded object-cover" />
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
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleChatImage(f) }}
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={imgUploading || sending}
                  title="Přidat fotku"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:opacity-40"
                >
                  {imgUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
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
                  disabled={sending || !text.trim()}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-white transition hover:bg-emerald-600 disabled:opacity-40"
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
              <p className="mt-2 flex items-center gap-1.5 px-1 text-[11px] text-slate-400">
                <Lock className="h-3 w-3" /> Kontaktní údaje {isProvider ? 'zákazníka' : ''} se odkryjí až po výběru.
              </p>
            </div>
          )}
          </section>

          {/* 3) Domluveno? Vybrat poskytovatele — hned pod chatem (jen zákazník) */}
          {canSelect && (
            <div className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-bold text-slate-900">Domluveno?</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                Výběrem vznikne objednávka s tímto poskytovatelem a ostatní jednání se uzavřou.
              </p>
              <button
                onClick={() => setConfirmOpen(true)}
                disabled={selectBusy}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-600 disabled:opacity-60"
              >
                {selectBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Vybrat poskytovatele
              </button>
            </div>
          )}
          {!isProvider && !canSelect && !orderId && !hasServiceForOrder && (
            <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
              Poskytovatel u této reakce zatím nemá vybranou konkrétní nabídku, ze které by šla založit objednávka.
            </p>
          )}
        </div>
      </div>

      {/* Potvrzovací modal výběru poskytovatele */}
      {confirmOpen && (
        <div className="fixed inset-0 z-[9990] flex items-end justify-center sm:items-center">
          <button aria-label="Zavřít" onClick={() => !selectBusy && setConfirmOpen(false)} className="absolute inset-0 bg-slate-950/40" />
          <div className="relative w-full max-w-md rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50">
              <CheckCircle2 className="h-6 w-6 text-emerald-600" />
            </div>
            <h2 className="text-center text-lg font-black text-slate-900">Vybrat tohoto poskytovatele?</h2>
            <p className="mx-auto mt-2 text-center text-sm leading-relaxed text-slate-600">
              Vznikne skutečná objednávka s tímto poskytovatelem a celá vaše domluva se do ní přenese.
              Ostatní jednání u této poptávky se uzavřou. Termín a platbu pak potvrdíte už v objednávce.
            </p>
            <div className="mt-6 flex flex-col gap-2">
              <button
                onClick={handleSelect}
                disabled={selectBusy}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-600 disabled:opacity-60"
              >
                {selectBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Ano, vybrat a vytvořit objednávku
              </button>
              <button
                onClick={() => setConfirmOpen(false)}
                disabled={selectBusy}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
              >
                Ještě ne
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}