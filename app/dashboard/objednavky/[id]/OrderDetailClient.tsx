'use client'
import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { Loader2, Send, MapPin, Phone, Tag, Wallet, ExternalLink, CalendarDays, CheckCircle2, CreditCard, ShieldCheck, Clock, XCircle, Flag, AlertTriangle, ImagePlus, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import OrderStatusButton from '../OrderStatusButton'
import { sendOrderMessage, updateOrderStatus, setOrderAddress } from '@/lib/actions/orders'
import { createDepositCheckout } from '@/lib/actions/deposit'
import ConfirmCompletionButton from '@/components/ui/ConfirmCompletionButton'
import ChatThread from '@/components/ui/ChatThread'
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
  location_type: string | null
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
  deposit_status: string | null
  deposit_amount: number | null
  location_city: string | null
  location_address: string | null
  service_location: string | null
  scheduled_at: string | null
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
  is_admin?: boolean | null
}

const STATUS_LABELS: Record<string, string> = {
  cekajici: 'Čeká na přijetí',
  prijato: 'Přijato',
  v_procesu: 'V procesu',
  ceka_potvrzeni: 'Čeká na potvrzení',
  dokonceno: 'Dokončeno',
  zruseno: 'Zrušeno',
  spor: 'Řeší se',
}
const STATUS_COLORS: Record<string, string> = {
  cekajici: 'bg-amber-100 text-amber-700 border-amber-200',
  prijato: 'bg-blue-100 text-blue-700 border-blue-200',
  v_procesu: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  ceka_potvrzeni: 'bg-purple-100 text-purple-700 border-purple-200',
  dokonceno: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  zruseno: 'bg-red-100 text-red-700 border-red-200',
  spor: 'bg-orange-100 text-orange-700 border-orange-200',
}

export default function OrderDetailClient({
  order,
  myProfile,
  otherProfile,
  otherCompletedCount,
  initialMessages,
  senderNames,
  isProvider,
  userId,
  platbaStav,
}: {
  order: OrderRow
  myProfile: ProfileLite | null
  otherProfile: ProfileLite | null
  otherCompletedCount: number
  initialMessages: MessageRow[]
  senderNames: Record<string, string>
  isProvider: boolean
  userId: string
  platbaStav?: string | null
}) {
  const [messages, setMessages] = useState<MessageRow[]>(initialMessages)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [chatImage, setChatImage] = useState<string | null>(null)
  const [imgUploading, setImgUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [payBusy, setPayBusy] = useState(false)
  const [payError, setPayError] = useState('')
  const [cancelBusy, setCancelBusy] = useState(false)
  const [cancelErr, setCancelErr] = useState('')
  const [addressInput, setAddressInput] = useState(order.location_address ?? '')
  const [addrBusy, setAddrBusy] = useState(false)
  const [addrErr, setAddrErr] = useState('')
  const [addrSaved, setAddrSaved] = useState(!!order.location_address)
  const scrollRef = useRef<HTMLDivElement>(null)

  const service = order.services
  const otherLabel = isProvider ? 'Zákazník' : 'Živnostník'

  const otherIsProvider = !isProvider
  const profileHref = otherIsProvider && otherProfile?.id ? `/profil/${otherProfile.id}` : null

  const memberSince = otherProfile?.created_at
    ? new Intl.DateTimeFormat('cs-CZ', { month: 'long', year: 'numeric' }).format(new Date(otherProfile.created_at))
    : null

  const isModelB = service?.payment_model === 'B'
  const depositAmount = isModelB ? Number(service?.quote_fee ?? 0) : Number(service?.deposit_amount ?? 0)
  const isCustomer = !isProvider
  const payLabel = isModelB ? 'poplatek za výjezd' : 'rezervační zálohu'
  const paidTitle = isModelB ? 'Poplatek za výjezd uhrazen' : 'Rezervační záloha uhrazena'
  const notPaidLabel = isModelB ? 'Poplatek za výjezd zatím nebyl uhrazen.' : 'Rezervační záloha zatím nebyla uhrazena.'
  const isPaid = order.deposit_status === 'paid' || order.deposit_status === 'released'
  const hasDeposit = depositAmount > 0
  const hasAddress = !!order.location_address || addrSaved
  // Adresu zákazníka řešíme JEN když se služba koná u zákazníka.
  // service_location má přednost; když chybí (starší objednávky), odvodíme z location_type služby.
  const atCustomer = order.service_location
    ? order.service_location === 'u_zakaznika'
    : (service?.location_type ? service.location_type !== 'u_poskytovatele' : true)

  const handleSaveAddress = async () => {
    if (addressInput.trim().length < 5) {
      setAddrErr('Zadejte prosím úplnou adresu (ulice a číslo).')
      return
    }
    setAddrBusy(true)
    setAddrErr('')
    const res = await setOrderAddress(order.id, addressInput)
    if (res.success) {
      setAddrSaved(true)
    } else {
      setAddrErr(res.error ?? 'Nepodařilo se uložit.')
    }
    setAddrBusy(false)
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length])

  const handleSend = async () => {
    const content = text.trim()
    if ((!content && !chatImage) || sending) return
    setSending(true)
    const result = await sendOrderMessage(order.id, content, chatImage)
    if (result.success && result.message) {
      setMessages((prev) => [...prev, result.message as MessageRow])
      setText('')
      setChatImage(null)
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
    const { data, error } = await supabase.storage.from('images').upload(fileName, file, { upsert: false, contentType: file.type })
    if (!error && data) {
      const { data: { publicUrl } } = supabase.storage.from('images').getPublicUrl(data.path)
      setChatImage(publicUrl)
    }
    setImgUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const handlePay = async () => {
    setPayBusy(true)
    setPayError('')
    const res = await createDepositCheckout(order.id)
    if (res.success) {
      window.location.href = res.url
    } else {
      setPayError(res.error)
      setPayBusy(false)
    }
  }

  const handleCustomerCancel = async () => {
    if (!confirm('Opravdu chcete objednávku zrušit?')) return
    setCancelBusy(true)
    setCancelErr('')
    const res = await updateOrderStatus(order.id, 'zruseno' as any)
    if (!res.success) {
      setCancelErr(res.error ?? 'Nepodařilo se zrušit.')
      setCancelBusy(false)
    }
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

  const canCustomerCancel = isCustomer && ['cekajici', 'prijato', 'v_procesu'].includes(order.status)

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

          {/* Stav zálohy i pro POSKYTOVATELE */}
          {isProvider && hasDeposit && order.status !== 'cekajici' && order.status !== 'zruseno' && (
            <div className={`mt-4 flex items-center gap-2 rounded-xl px-4 py-3 text-sm ${isPaid ? 'border border-emerald-200 bg-emerald-50 text-emerald-800' : 'border border-amber-200 bg-amber-50 text-amber-800'}`}>
              {isPaid ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <Clock className="h-4 w-4 shrink-0" />}
              {order.deposit_status === 'released'
                ? `${paidTitle} a uvolněn vám (${Number(order.deposit_amount ?? depositAmount).toLocaleString('cs-CZ')} Kč)`
                : isPaid
                  ? `${paidTitle} (${Number(order.deposit_amount ?? depositAmount).toLocaleString('cs-CZ')} Kč) – drží se přes Propojo`
                  : `Čeká se na úhradu (${depositAmount.toLocaleString('cs-CZ')} Kč) od zákazníka`}
            </div>
          )}

          {/* Termín (z rezervace) */}
          {order.scheduled_at && order.status !== 'zruseno' && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm">
              <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Termín</p>
                <p className="font-bold text-slate-800">
                  {new Intl.DateTimeFormat('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(order.scheduled_at))}
                </p>
              </div>
            </div>
          )}

          {/* Místo výkonu */}
          {order.status !== 'zruseno' && (atCustomer ? (order.location_city || order.location_address) : true) && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Místo</p>
                {!atCustomer
                  ? <p className="font-medium text-slate-800">U poskytovatele (provozovna)</p>
                  : order.location_address && order.status !== 'cekajici'
                    ? <p className="font-medium text-slate-800">{order.location_address}</p>
                    : <p className="font-medium text-slate-800">{order.location_city ?? '—'}{order.status === 'cekajici' ? '' : ' (přesná adresa se doplní)'}</p>}
              </div>
            </div>
          )}

          {order.description && (
            <div className="mt-4">
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Poznámka od zákazníka</h3>
              <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700 whitespace-pre-wrap">{order.description}</p>
            </div>
          )}

          {/* Akce poskytovatele */}
          {isProvider && (
            <div className="mt-5 border-t border-slate-100 pt-5">
              <OrderStatusButton orderId={order.id} currentStatus={order.status} depositStatus={order.deposit_status} />
            </div>
          )}

          {/* Zrušení zákazníkem */}
          {canCustomerCancel && (
            <div className="mt-5 border-t border-slate-100 pt-5">
              <button
                onClick={handleCustomerCancel}
                disabled={cancelBusy}
                className="flex items-center gap-1.5 rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 transition-all hover:bg-red-50 disabled:opacity-60"
              >
                {cancelBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                Zrušit objednávku
              </button>
              {isPaid && <p className="mt-2 text-xs text-slate-400">Zaplacená záloha vám bude vrácena.</p>}
              {cancelErr && <p className="mt-2 text-sm text-red-600">{cancelErr}</p>}
            </div>
          )}
        </div>

        {/* ── SPOR: informace pro obě strany ─────────────────── */}
        {order.status === 'spor' && (
          <div className="rounded-2xl border border-orange-200 bg-orange-50 p-6">
            <div className="mb-1 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-600" />
              <h2 className="font-black text-orange-900">Objednávku řeší Propojo</h2>
            </div>
            <p className="text-sm text-orange-800">
              {isCustomer
                ? 'Nahlásili jste problém. Zálohu jsme podrželi a situaci posoudíme. Ozveme se vám.'
                : 'Zákazník nahlásil problém. Zálohu jsme podrželi a situaci posoudíme. Ozveme se vám.'}
            </p>
          </div>
        )}

        {/* ── PŘESNÁ ADRESA (jen zákazník, jen když se koná U ZÁKAZNÍKA, po přijetí, před zaplacením) ── */}
        {isCustomer && atCustomer && (order.status === 'prijato' || order.status === 'v_procesu') && !isPaid && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-1 flex items-center gap-2">
              <MapPin className="h-5 w-5 text-emerald-600" />
              <h2 className="font-black text-slate-900">Přesná adresa{hasAddress ? '' : ' *'}</h2>
            </div>
            <p className="mb-3 text-sm text-slate-500">
              {hasAddress
                ? 'Adresa je vyplněná. Můžete ji ještě upravit, dokud nezaplatíte.'
                : `Objednávka byla přijata. Doplňte přesnou adresu${hasDeposit ? ', kam má řemeslník dorazit — pak budete moci zaplatit.' : ', kam má řemeslník dorazit.'}`}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                value={addressInput}
                onChange={(e) => { setAddressInput(e.target.value); setAddrSaved(false) }}
                placeholder="Ulice a číslo, město"
                className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                maxLength={200}
              />
              <button
                onClick={handleSaveAddress}
                disabled={addrBusy}
                className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                {addrBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : (hasAddress ? 'Upravit' : 'Uložit adresu')}
              </button>
            </div>
            {order.location_city && (
              <p className="mt-2 text-xs text-slate-400">Město z objednávky: {order.location_city}</p>
            )}
            {addrSaved && <p className="mt-2 text-sm text-emerald-600">Adresa uložena.</p>}
            {addrErr && <p className="mt-2 text-sm text-red-600">{addrErr}</p>}
          </div>
        )}

        {/* ── PLATBA ZÁLOHY (jen zákazník, po přijetí) ───────── */}
        {isCustomer && hasDeposit && (order.status === 'prijato' || order.status === 'v_procesu') && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            {platbaStav === 'uspech' && (
              <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                <CheckCircle2 className="h-4 w-4 shrink-0" /> Platba proběhla. Potvrzení se může projevit do pár sekund – obnovte stránku.
              </div>
            )}
            {platbaStav === 'zruseno' && (
              <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                <Clock className="h-4 w-4 shrink-0" /> Platba byla zrušena. {notPaidLabel}
              </div>
            )}

            {isPaid ? (
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100">
                  <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                </div>
                <div>
                  <p className="font-bold text-slate-900">{paidTitle}</p>
                  <p className="text-sm text-slate-500">
                    {Number(order.deposit_amount ?? depositAmount).toLocaleString('cs-CZ')} Kč · drží se bezpečně přes Propojo
                  </p>
                </div>
              </div>
            ) : (
              <div>
                <div className="mb-1 flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-emerald-600" />
                  <h2 className="font-black text-slate-900">Zaplaťte {payLabel}</h2>
                </div>
                <p className="mb-4 text-sm text-slate-500">
                  Poskytovatel objednávku přijal. Pro potvrzení uhraďte {payLabel} ve výši{' '}
                  <strong className="text-slate-800">{depositAmount.toLocaleString('cs-CZ')} Kč</strong>.
                  {!isModelB && ' Záloha se započítá do konečné ceny.'}
                </p>

                <div className="mb-4 flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <span>Platba je bezpečně držená přes Propojo a poskytovateli se uvolní až po {isModelB ? 'provedení výjezdu' : 'dokončení práce'}.</span>
                </div>

                {atCustomer && !hasAddress ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    Nejdříve prosím vyplňte přesnou adresu výše — pak budete moci zaplatit.
                  </div>
                ) : (
                  <>
                    <button onClick={handlePay} disabled={payBusy} className="btn-primary w-full justify-center disabled:opacity-60">
                      {payBusy ? <><Loader2 className="h-4 w-4 animate-spin" /> Přesměrovávám…</> : <><CreditCard className="h-4 w-4" /> Zaplatit {depositAmount.toLocaleString('cs-CZ')} Kč</>}
                    </button>
                    {payError && <p className="mt-2 text-center text-sm text-red-600">{payError}</p>}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── POTVRZENÍ DOKONČENÍ (jen zákazník, stav ceka_potvrzeni) ── */}
        {isCustomer && order.status === 'ceka_potvrzeni' && (
          <div className="rounded-2xl border border-purple-200 bg-white p-6 shadow-sm">
            <div className="mb-1 flex items-center gap-2">
              <Flag className="h-5 w-5 text-purple-600" />
              <h2 className="font-black text-slate-900">Poskytovatel označil zakázku jako splněnou</h2>
            </div>
            <p className="mb-4 text-sm text-slate-500">
              Pokud {isModelB ? 'výjezd a nacenění proběhly' : 'řemeslník dorazil a plní zakázku'}, potvrďte to.
              {hasDeposit && ' Tím se mu uvolní zaplacená záloha.'}
              {' '}Další domluva o ceně a postupu probíhá přímo s řemeslníkem.
            </p>
            <ConfirmCompletionButton orderId={order.id} hasDeposit={hasDeposit} />
          </div>
        )}

        {/* Chat */}
        <div className="flex flex-col rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-3">
            <h2 className="text-sm font-bold text-slate-800">Zprávy</h2>
          </div>

          <div ref={scrollRef} className="max-h-[420px] min-h-[200px] space-y-3 overflow-y-auto px-5 py-4">
            <ChatThread messages={messages as any} myUserId={userId} senderNames={senderNames} />
          </div>

          <div className="border-t border-slate-100 p-3">
            {chatImage && (
              <div className="mb-2 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-1.5">
                <img src={chatImage} alt="Náhled" className="h-12 w-12 rounded object-cover" />
                <button onClick={() => setChatImage(null)} className="flex h-6 w-6 items-center justify-center rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-600">
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
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
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 disabled:opacity-40"
              >
                {imgUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
              </button>
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                placeholder="Napište zprávu…"
                className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
              />
              <button
                onClick={handleSend}
                disabled={sending || (!text.trim() && !chatImage)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-white transition-colors hover:bg-emerald-600 disabled:opacity-40"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
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