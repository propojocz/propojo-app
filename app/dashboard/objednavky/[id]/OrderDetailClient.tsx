'use client'
import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { Loader2, Send, MapPin, Phone, Tag, Wallet, ExternalLink, CalendarDays, CheckCircle2 } from 'lucide-react'
import OrderStatusButton from '../OrderStatusButton'
import { sendOrderMessage } from '@/lib/actions/orders'
import Avatar from '@/components/ui/Avatar'

type ServiceLite = {
  id: string
  title: string
  price: number | null
  price_unit: string | null
  category: string | null
  city: string | null
  description: string | null
  payment_model: string | null
  deposit_amount: number | null
  quote_fee: number | null
}

type OrderRow = {
  id: string
  customer_id: string
  provider_id: string
  service_id: string
  status: string
  description: string | null
  total_price: number | null
  created_at: string
  services: ServiceLite | null
}

type ProfileLite = {
  id: string
  full_name: string | null
  avatar_url: string | null
  phone: string | null
  city: string | null
  created_at: string | null
}

type MessageRow = {
  id: string
  order_id: string
  sender_id: string
  content: string
  created_at: string
  read_at: string | null
  image_url: string | null
}

const STATUS_LABELS: Record<string, string> = {
  cekajici: 'Čeká na přijetí',
  prijato: 'Přijato',
  v_procesu: 'V procesu',
  dokonceno: 'Dokončeno',
  zruseno: 'Zrušeno',
}
const STATUS_COLORS: Record<string, string> = {
  cekajici: 'bg-amber-100 text-amber-700 border-amber-200',
  prijato: 'bg-blue-100 text-blue-700 border-blue-200',
  v_procesu: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  dokonceno: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  zruseno: 'bg-red-100 text-red-700 border-red-200',
}

export default function OrderDetailClient({
  order,
  myProfile,
  otherProfile,
  otherCompletedCount,
  initialMessages,
  isProvider,
  userId,
}: {
  order: OrderRow
  myProfile: ProfileLite | null
  otherProfile: ProfileLite | null
  otherCompletedCount: number
  initialMessages: MessageRow[]
  isProvider: boolean
  userId: string
}) {
  const [messages, setMessages] = useState<MessageRow[]>(initialMessages)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const service = order.services
  const otherLabel = isProvider ? 'Zákazník' : 'Živnostník'

  // Karta klikací jen směrem na poskytovatele (má veřejný profil).
  const otherIsProvider = !isProvider
  const profileHref = otherIsProvider && otherProfile?.id ? `/profil/${otherProfile.id}` : null

  // "Na Propojo od …"
  const memberSince = otherProfile?.created_at
    ? new Intl.DateTimeFormat('cs-CZ', { month: 'long', year: 'numeric' }).format(new Date(otherProfile.created_at))
    : null

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length])

  const handleSend = async () => {
    const content = text.trim()
    if (!content || sending) return
    setSending(true)
    const result = await sendOrderMessage(order.id, content)
    if (result.success && result.message) {
      setMessages((prev) => [...prev, result.message as MessageRow])
      setText('')
    }
    setSending(false)
  }

  const cardInner = (
    <div className="flex items-center gap-3">
      <Avatar name={otherProfile?.full_name} url={otherProfile?.avatar_url} size={48} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold text-slate-900">{otherProfile?.full_name ?? otherLabel}</p>
        {otherProfile?.city && <p className="text-sm text-slate-500">{otherProfile.city}</p>}
      </div>
      {profileHref && <ExternalLink className="h-4 w-4 shrink-0 text-slate-300" />}
    </div>
  )

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      {/* Levý sloupec: detail + chat */}
      <div className="space-y-4">
        {/* Hlavička objednávky */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-black text-slate-900">{service?.title ?? 'Neznámá služba'}</h1>
              <p className="mt-1 text-sm text-slate-500">
                Vytvořeno {new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(order.created_at))}
              </p>
            </div>
            <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_COLORS[order.status] ?? 'bg-slate-100 text-slate-500'}`}>
              {STATUS_LABELS[order.status] ?? order.status}
            </span>
          </div>

          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">
            {service?.category && (
              <span className="inline-flex items-center gap-1.5"><Tag className="h-4 w-4 text-slate-400" /> {service.category}</span>
            )}
            {service?.city && (
              <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4 text-slate-400" /> {service.city}</span>
            )}
            {(service?.price ?? 0) > 0 && (
              <span className="inline-flex items-center gap-1.5"><Wallet className="h-4 w-4 text-slate-400" /> {Number(service?.price).toLocaleString('cs-CZ')} Kč{service?.price_unit ? `/${service.price_unit}` : ''}</span>
            )}
          </div>

          {service?.payment_model === 'A' && (service?.deposit_amount ?? 0) > 0 && (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              <strong>Model A — rezervační záloha:</strong> {Number(service?.deposit_amount).toLocaleString('cs-CZ')} Kč (započítává se do ceny)
            </div>
          )}
          {service?.payment_model === 'B' && (
            <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
              <strong>Model B — nacenění na místě</strong>{(service?.quote_fee ?? 0) > 0 ? `: poplatek za výjezd ${Number(service?.quote_fee).toLocaleString('cs-CZ')} Kč` : ''}
            </div>
          )}

          {order.description && (
            <div className="mt-4">
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Poznámka od zákazníka</h3>
              <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700 whitespace-pre-wrap">{order.description}</p>
            </div>
          )}

          {isProvider && (
            <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-5">
              <OrderStatusButton orderId={order.id} currentStatus={order.status} />
            </div>
          )}
        </div>

        {/* Chat */}
        <div className="flex flex-col rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-3">
            <h2 className="text-sm font-bold text-slate-800">Zprávy</h2>
          </div>

          <div ref={scrollRef} className="max-h-[420px] min-h-[200px] space-y-3 overflow-y-auto px-5 py-4">
            {messages.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">Zatím žádné zprávy. Napište první.</p>
            ) : (
              messages.map((m) => {
                const mine = m.sender_id === userId
                return (
                  <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${mine ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-800'}`}>
                      <p className="whitespace-pre-wrap break-words">{m.content}</p>
                      <p className={`mt-1 text-[11px] ${mine ? 'text-emerald-100' : 'text-slate-400'}`}>
                        {new Intl.DateTimeFormat('cs-CZ', { hour: '2-digit', minute: '2-digit' }).format(new Date(m.created_at))}
                      </p>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          <div className="flex items-center gap-2 border-t border-slate-100 p-3">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
              placeholder="Napište zprávu…"
              className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
            />
            <button
              onClick={handleSend}
              disabled={sending || !text.trim()}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-white transition-colors hover:bg-emerald-600 disabled:opacity-40"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Pravý sloupec: druhá strana */}
      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-400">{otherLabel}</h3>

          {profileHref ? (
            <Link href={profileHref} className="-m-2 block rounded-xl p-2 transition-colors hover:bg-slate-50">
              {cardInner}
            </Link>
          ) : (
            cardInner
          )}

          {/* Důvěryhodnostní info o druhé straně */}
          <div className="mt-4 space-y-2 border-t border-slate-100 pt-4 text-sm text-slate-600">
            {memberSince && (
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-slate-400" />
                <span>Na Propojo od {memberSince}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-slate-400" />
              <span>{otherCompletedCount} {otherCompletedCount === 1 ? 'dokončená objednávka' : otherCompletedCount >= 2 && otherCompletedCount <= 4 ? 'dokončené objednávky' : 'dokončených objednávek'}</span>
            </div>
          </div>

          {/* Kontakt odhalíme až po přijetí objednávky */}
          {order.status !== 'cekajici' && order.status !== 'zruseno' && otherProfile?.phone && (
            <a href={`tel:${otherProfile.phone}`} className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600 hover:text-emerald-700">
              <Phone className="h-4 w-4" /> {otherProfile.phone}
            </a>
          )}
          {order.status === 'cekajici' && (
            <p className="mt-4 text-xs text-slate-400">Kontaktní údaje se zobrazí po přijetí objednávky.</p>
          )}
        </div>
      </div>
    </div>
  )
}