'use client'
import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { Loader2, Send, MapPin, Phone, Tag, Wallet, ExternalLink, CalendarDays, CheckCircle2, CreditCard, ShieldCheck, Clock, XCircle, Flag, AlertTriangle, ImagePlus, X, RotateCcw, Package } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import OrderStatusButton from '../OrderStatusButton'
import { sendOrderMessage, updateOrderStatus, setOrderAddress } from '@/lib/actions/orders'
import { createDepositCheckout } from '@/lib/actions/deposit'
import { releaseUnpaidReservation } from '@/lib/actions/reservation-release'
import ConfirmCompletionButton from '@/components/ui/ConfirmCompletionButton'
import ChatThread from '@/components/ui/ChatThread'
import Avatar from '@/components/ui/Avatar'
import AddressInput from '@/components/ui/AddressInput'
import ServiceMap from '@/components/ui/ServiceMap'
import StornoPanel from '@/components/ui/StornoPanel'
import { terminDlouze, datumCas } from '@/lib/format'
import OrderTimeline from '@/components/ui/OrderTimeline'
import { vyrobekStornoPodil } from '@/lib/product-storno'

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
  address: string | null
  address_lat: number | null
  address_lng: number | null
  address_public: boolean | null
  phone: string | null
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
  location_lat: number | null
  location_lng: number | null
  service_location: string | null
  scheduled_at: string | null
  slot_id: string | null
  hold_expires_at: string | null
  quantity: number
  needed_at: string | null
  service_item_id: string | null
  dispute_reason: string | null
  dispute_category: string | null
  dispute_photos: string[] | null
  product_fulfillment_status: string | null
  product_ready_at: string | null
  ready_photo_url: string | null
  product_handed_over_at: string | null
  services: ServiceLite | null
  service_items?: {
    name: string | null
    price: number | null
    price_unit: string | null
    deposit_amount: number | null
    deposit_type: string | null
    payment_model: string | null
    duration_minutes: number | null
    quote_fee: number | null
    fee_mode: string | null
    // Výrobek
    item_type: string | null
    stock_mode: string | null
    lead_time_days: number | null
  } | null
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

// Popisky kategorií sporu — musí sedět s hodnotami, které ukládá
// ConfirmCompletionButton (a povoluje CHECK v DB).
const DISPUTE_LABEL: Record<string, string> = {
  nepredano: 'Objednávku zákazník nepřevzal',
  poskozeno: 'Výrobek je poškozený',
  neodpovida: 'Neodpovídá objednávce',
  chybi: 'Něco v objednávce chybí',
  nedorazil: 'Poskytovatel nedorazil',
  jine: 'Jiný problém',
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
  hasTimeProposals = false,
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
  hasTimeProposals?: boolean
}) {
  const [messages, setMessages] = useState<MessageRow[]>(initialMessages)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [chatImage, setChatImage] = useState<string | null>(null)
  const [imgUploading, setImgUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [payBusy, setPayBusy] = useState(false)
  const [payError, setPayError] = useState('')
  const [switchBusy, setSwitchBusy] = useState(false)
  const [switchErr, setSwitchErr] = useState('')
  const [cancelBusy, setCancelBusy] = useState(false)
  const [cancelErr, setCancelErr] = useState('')
  const [changeBusy, setChangeBusy] = useState(false)
  const [changeSent, setChangeSent] = useState(false)
  const [changeErr, setChangeErr] = useState('')
  // Adresa: text + souřadnice (souřadnice máme jen když zákazník vybral z našeptávače).
  const [addressInput, setAddressInput] = useState(order.location_address ?? '')
  const [addrCoords, setAddrCoords] = useState<{ lat: number | null; lng: number | null }>({
    lat: order.location_lat ?? null,
    lng: order.location_lng ?? null,
  })
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

  const item = order.service_items ?? null
  const paymentModel = item?.payment_model ?? service?.payment_model
  const isModelB = paymentModel === 'B'
  const depositType = item?.deposit_type ?? 'zaloha'
  const isFullPayment = !isModelB && depositType === 'plna_platba' && Number(item?.price ?? 0) > 0

  // Částka, která se opravdu platí předem. U plné platby je to cena úkonu,
  // u zálohy deposit_amount a u „bez platby" nula. Hodnota na objednávce má
  // přednost, ale u starších chybných objednávek s plnou platbou umíme dopočítat cenu z úkonu.
  const depositAmount = Number(
    (isFullPayment && (order.deposit_amount == null || Number(order.deposit_amount) <= 0)
      ? item?.price
      : order.deposit_amount) ??
    (isModelB
      ? (item?.quote_fee ?? service?.quote_fee)
      : depositType === 'bez_platby'
        ? 0
        : isFullPayment
          ? item?.price
          : (item?.deposit_amount ?? service?.deposit_amount)) ??
    0
  )
  const isCustomer = !isProvider
  const payLabel = isModelB ? 'poplatek za výjezd' : isFullPayment ? 'celou cenu' : 'rezervační zálohu'
  const paidTitle = isModelB ? 'Poplatek za výjezd uhrazen' : isFullPayment ? 'Celá cena uhrazena' : 'Rezervační záloha uhrazena'
  const isPaid = order.deposit_status === 'paid' || order.deposit_status === 'released'
  // Vratka se zákazníkovi dřív ukázala jen v notifikaci, která zapadne.
  // Tady zůstane natrvalo, ať je dohledatelná i za měsíc.
  const isRefunded = order.deposit_status === 'refunded'
  // Storno poplatek: zákazník ho musí vidět PŘED zrušením, ne až z vyúčtování.
  const stornoRezim = (order as any).service_items?.fee_mode === 'storno'
  const stornoCastka = Math.min(
    Number((order as any).no_show_fee_amount ?? 0),
    Number(order.deposit_amount ?? depositAmount ?? 0)
  )
  // Výrobek na objednávku: stejný náhled, ale procentem podle blízkosti
  // termínu dodání — stejný vzorec, jaký použije server při skutečném zrušení.
  const jeVyrobek = item?.item_type === 'product'
  const jeVyrobekNaObjednavku = jeVyrobek && item?.stock_mode === 'made_to_order'
  // Doručení vs. osobní odběr — u výrobku se ukládá do service_location stejně
  // jako místo výkonu u služby ('u_zakaznika' = doručit).
  const productDelivery = jeVyrobek && order.service_location === 'u_zakaznika'
  const vyrobekPodil = jeVyrobekNaObjednavku
    ? vyrobekStornoPodil(order.needed_at, item?.lead_time_days)
    : 0
  const vyrobekStornoCastka = Math.round(Number(order.deposit_amount ?? depositAmount ?? 0) * vyrobekPodil)
  // Konec služby = termín + délka úkonu. Po něm smí zakázku uzavřít i zákazník,
  // kdyby na to poskytovatel zapomněl — jinak objednávka visí donekonečna.
  const sluzbaSkoncila = (() => {
    if (!order.scheduled_at) return false
    const delka = Number((order as any).service_items?.duration_minutes ?? 0)
    return new Date(order.scheduled_at).getTime() + delka * 60_000 <= Date.now()
  })()
  const muzePotvrdit = isCustomer && (
    order.status === 'ceka_potvrzeni' ||
    ((order.status === 'prijato' || order.status === 'v_procesu') && sluzbaSkoncila && isPaid)
  )
  const hasDeposit = depositAmount > 0
  const hasAddress = !!order.location_address || addrSaved
  const atCustomer = order.service_location
    ? order.service_location === 'u_zakaznika'
    : (service?.location_type ? service.location_type !== 'u_poskytovatele' : true)
  // Platba je stále otevřený úkol vždy, když existuje částka k úhradě,
  // objednávka má termín a peníze ještě nejsou zaplacené. Nespoléháme jen na
  // deposit_status='pending' ani na ?platba=zruseno — browser Back nemusí
  // cancel_url vůbec použít a starší objednávky mohou mít deposit_status prázdný.
  const paymentDue = isCustomer
    && hasDeposit
    && !!order.scheduled_at
    && (order.status === 'prijato' || order.status === 'v_procesu')
    && !isPaid
    && !isRefunded
  const paymentInterrupted = paymentDue && platbaStav === 'zruseno'

  const handleSaveAddress = async () => {
    if (addressInput.trim().length < 5) {
      setAddrErr('Zadejte prosím úplnou adresu (ulice a číslo).')
      return
    }
    setAddrBusy(true)
    setAddrErr('')
    const res = await setOrderAddress(order.id, addressInput, addrCoords)
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

  const handleChooseDifferentTerm = async () => {
    if (switchBusy) return
    const ok = confirm(
      order.slot_id
        ? 'Uvolnit tento nezaplacený termín a vrátit se k výběru jiného?'
        : 'Zrušit tento nezaplacený termín a pokračovat v domluvě na jiném?'
    )
    if (!ok) return

    setSwitchBusy(true)
    setSwitchErr('')
    const res = await releaseUnpaidReservation(order.id, 'change_term')
    if (!res.released) {
      setSwitchErr('Termín se nepodařilo uvolnit. Obnovte stránku a zkuste to znovu.')
      setSwitchBusy(false)
      return
    }

    if (res.outcome === 'cancelled') {
      window.location.href = `/sluzby/${order.service_id}`
      return
    }

    // Domluvený termín: stejná objednávka i chat zůstávají, jen se vrátíme do domlouvání.
    window.location.href = `/dashboard/objednavky/${order.id}`
  }

  const handleCustomerCancel = async () => {
    const zprava = stornoRezim && stornoCastka > 0
      ? `Opravdu zrušit? Poskytovatel si nechá storno poplatek ${stornoCastka.toLocaleString('cs-CZ')} Kč.`
      : jeVyrobekNaObjednavku && vyrobekStornoCastka > 0
        ? `Opravdu zrušit? Blízko termínu dodání si poskytovatel nechá ${vyrobekStornoCastka.toLocaleString('cs-CZ')} Kč.`
        : 'Opravdu chcete objednávku zrušit?'
    if (!confirm(zprava)) return
    setCancelBusy(true)
    setCancelErr('')
    const res = await updateOrderStatus(order.id, 'zruseno' as any)
    if (!res.success) {
      setCancelErr(res.error ?? 'Nepodařilo se zrušit.')
      setCancelBusy(false)
    }
  }

  const handleRequestTimeChange = async () => {
    if (!order.scheduled_at || changeBusy) return
    setChangeBusy(true)
    setChangeErr('')
    const text = `Prosím o změnu potvrzeného termínu ${terminDlouze(order.scheduled_at)}. Navrhněte mi prosím jiné možnosti.`
    const res = await sendOrderMessage(order.id, text)
    if (res.success) {
      if (res.message) setMessages((prev) => [...prev, res.message as MessageRow])
      setChangeSent(true)
    } else {
      setChangeErr(res.error ?? 'Požadavek se nepodařilo odeslat.')
    }
    setChangeBusy(false)
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
  const canRequestTimeChange = isCustomer
    && order.status === 'prijato'
    && !!order.scheduled_at
    && new Date(order.scheduled_at).getTime() > Date.now()
    // Dokud je potřeba zaplatit, změna termínu se řeší přímo v platebním bloku
    // přes „Vybrat jiný termín“, ne jako nový požadavek v chatu.
    && (!hasDeposit || isPaid)

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
                Vytvořeno {datumCas(order.created_at)}
              </p>
            </div>
            {(order as any).is_inquiry === true && order.status === 'cekajici' && !order.scheduled_at ? (
              <span className="shrink-0 rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                Dotaz
              </span>
            ) : (
              <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_COLORS[order.status] ?? 'bg-slate-100 text-slate-500'}`}>
                {STATUS_LABELS[order.status] ?? order.status}
              </span>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">
            {service?.category && (
              <span className="inline-flex items-center gap-1.5"><Tag className="h-4 w-4 text-slate-400" /> {service.category}</span>
            )}
            {service?.city && (
              <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4 text-slate-400" /> {service.city}</span>
            )}
            {Number(item?.price ?? service?.price ?? 0) > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <Wallet className="h-4 w-4 text-slate-400" />
                {Number(item?.price ?? service?.price).toLocaleString('cs-CZ')} Kč
                {(item?.price_unit ?? service?.price_unit) ? `/${item?.price_unit ?? service?.price_unit}` : ''}
              </span>
            )}
          </div>

          {!isModelB && depositType !== 'bez_platby' && depositAmount > 0 && (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {isFullPayment ? (
                <>
                  <strong>Platba předem:</strong> {depositAmount.toLocaleString('cs-CZ')} Kč{' '}
                  <span>(na místě už nic nedoplácíte)</span>
                </>
              ) : (
                <>
                  <strong>Rezervace se zálohou:</strong> {depositAmount.toLocaleString('cs-CZ')} Kč{' '}
                  <span>(započítává se do ceny)</span>
                </>
              )}
            </div>
          )}
          {isModelB && (
            <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
              <strong>Výjezd a nacenění</strong>{depositAmount > 0 ? `: poplatek za výjezd ${depositAmount.toLocaleString('cs-CZ')} Kč` : ''}
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
                  : isFullPayment
                    ? `Čeká se na úhradu celé ceny (${depositAmount.toLocaleString('cs-CZ')} Kč) od zákazníka`
                    : `Čeká se na úhradu (${depositAmount.toLocaleString('cs-CZ')} Kč) od zákazníka`}
            </div>
          )}

          {/* STORNO ČEKÁ NA VYŘÍZENÍ — poskytovatel může odpustit */}
          {isProvider
            && (order as any).storno_marked_at
            && order.deposit_status === 'paid'
            && Number((order as any).storno_fee_amount ?? 0) > 0 && (
            <div className="mt-4">
              <StornoPanel
                orderId={order.id}
                poplatek={Number((order as any).storno_fee_amount ?? 0)}
                zaplaceno={Number(order.deposit_amount ?? depositAmount ?? 0)}
                markedAt={(order as any).storno_marked_at}
              />
            </div>
          )}

          {/* VRÁCENÁ ZÁLOHA — vidí obě strany, zůstává dohledatelné */}
          {isRefunded && (
            <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <RotateCcw className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <div className="text-sm">
                <p className="font-bold text-emerald-900">
                  {isCustomer ? 'Peníze jsme vám vrátili' : 'Záloha byla zákazníkovi vrácena'}
                </p>
                <p className="mt-0.5 leading-relaxed text-emerald-800">
                  {Number(order.deposit_amount ?? depositAmount ?? 0).toLocaleString('cs-CZ')} Kč
                  {isCustomer
                    ? ' se vrací na kartu, ze které jste platili. U banky se částka objeví zpravidla do několika pracovních dnů.'
                    : ' byla vrácena zpět zákazníkovi.'}
                </p>
              </div>
            </div>
          )}

          {/* Termín (z rezervace) */}
          {order.scheduled_at && order.status !== 'zruseno' && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm">
              <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Termín</p>
                <p className="font-bold text-slate-800">
                  {terminDlouze(order.scheduled_at)}
                </p>
              </div>
            </div>
          )}

          {/* Výrobek nemá termín (scheduled_at) — místo něj množství, den
              dodání/vyzvednutí a způsob převzetí (service_location se u
              výrobku ukládá stejně jako u služby: u_zakaznika = doručení). */}
          {jeVyrobek && order.status !== 'zruseno' && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm">
              <Package className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Objednávka</p>
                <p className="font-bold text-slate-800">
                  {order.quantity}× {item?.name ?? 'výrobek'}
                </p>
                <p className="mt-0.5 text-slate-600">
                  {order.needed_at && (
                    <>
                      {jeVyrobekNaObjednavku ? 'Dodání' : 'Vyzvednutí'}{': '}
                      {new Intl.DateTimeFormat('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' })
                        .format(new Date(`${order.needed_at}T00:00:00`))}
                    </>
                  )}
                  {order.needed_at && order.service_location ? ' · ' : ''}
                  {order.service_location === 'u_zakaznika'
                    ? 'Doručení'
                    : order.service_location === 'u_poskytovatele'
                      ? 'Osobní odběr'
                      : ''}
                </p>

                {/* Fotka hotové objednávky od poskytovatele. */}
                {order.ready_photo_url && (
                  <div className="mt-3">
                    <p className="mb-1 text-xs font-semibold text-emerald-700">Vaše objednávka je hotová</p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={order.ready_photo_url}
                      alt="Hotová objednávka"
                      className="max-h-56 w-full rounded-xl border border-emerald-200 object-cover"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {canRequestTimeChange && (
            <div className="mt-2">
              <button
                type="button"
                onClick={handleRequestTimeChange}
                disabled={changeBusy || changeSent}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-amber-300 hover:bg-amber-50 hover:text-amber-800 disabled:opacity-60"
              >
                {changeBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                {changeSent ? 'Požadavek na změnu odeslán' : 'Požádat o změnu termínu'}
              </button>
              {changeSent && (
                <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
                  Původní termín zatím platí. Poskytovatel vám může navrhnout nové možnosti; změní se až po vašem potvrzení.
                </p>
              )}
              {changeErr && <p className="mt-1.5 text-xs text-red-600">{changeErr}</p>}
            </div>
          )}

          {/* Místo výkonu */}
          {order.status !== 'zruseno' && (atCustomer ? (order.location_city || order.location_address) : true) && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Místo</p>
                {!atCustomer
                  ? (
                    // Adresa provozovny — bez ní zákazník neví, kam si má dojít.
                    // Přesnou adresu ukážeme až po potvrzení objednávky; předtím
                    // (nebo když ji poskytovatel nezveřejnil) jen město.
                    <>
                      {service?.address && order.status !== 'cekajici' ? (
                        <p className="font-medium text-slate-800">{service.address}</p>
                      ) : (
                        <p className="font-medium text-slate-800">
                          {service?.city ?? '—'}
                          {service?.address ? ' — přesnou adresu uvidíte po potvrzení objednávky' : ''}
                        </p>
                      )}
                      {service?.phone && order.status !== 'cekajici' ? (
                        <p className="mt-0.5 text-xs text-slate-500">Telefon: {service.phone}</p>
                      ) : null}
                    </>
                  )
                  : order.location_address && order.status !== 'cekajici'
                    ? <p className="font-medium text-slate-800">{order.location_address}</p>
                    : <p className="font-medium text-slate-800">{order.location_city ?? '—'}{order.status === 'cekajici' ? '' : ' (přesná adresa se doplní)'}</p>}
              </div>
            </div>
          )}

          {/* Mapa pro ZÁKAZNÍKA — kam si dojít pro výrobek / na službu do provozovny */}
          {!isProvider && !atCustomer && service?.address_lat != null && service?.address_lng != null
            && order.status !== 'zruseno' && order.status !== 'cekajici' && (
            <div className="mt-4">
              <ServiceMap lat={service.address_lat} lng={service.address_lng} label={service.address ?? 'Provozovna'} />
            </div>
          )}

          {/* Mapa pro POSKYTOVATELE — kam dojet, když zákazník vybral adresu z našeptávače */}
          {isProvider && atCustomer && order.location_lat != null && order.location_lng != null && order.status !== 'zruseno' && order.status !== 'cekajici' && (
            <div className="mt-4">
              <ServiceMap lat={order.location_lat} lng={order.location_lng} label={order.location_address ?? 'Adresa zákazníka'} />
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
              <OrderStatusButton
                orderId={order.id}
                currentStatus={order.status}
                depositStatus={order.deposit_status}
                scheduledAt={order.scheduled_at}
                durationMinutes={(order as any).service_items?.duration_minutes ?? null}
                canAcceptWithoutTime={isModelB}
                isProduct={jeVyrobek}
                productQuantity={order.quantity}
                productName={item?.name ?? null}
                neededAt={order.needed_at}
                confirmationDeadline={(order as any).confirmation_deadline ?? null}
                serviceItemId={order.service_item_id ?? null}
                fulfillmentStatus={order.product_fulfillment_status}
                isDelivery={productDelivery}
              />
            </div>
          )}

          {/* Rebook – zákazník u dokončené objednávky */}
          {isCustomer && order.status === 'dokonceno' && service && (
            <div className="mt-5 border-t border-slate-100 pt-5">
              <Link
                href={`/sluzby/${order.service_id}`}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-600"
              >
                <RotateCcw className="h-4 w-4" /> Objednat znovu
              </Link>
              <p className="mt-2 text-center text-xs text-slate-400">Spokojenost? Objednejte si stejnou službu znovu jedním klikem.</p>
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
                ? 'Nahlásili jste problém. Platbu jsme podrželi a situaci posoudíme. Ozveme se vám.'
                : 'Zákazník nahlásil problém. Platbu jsme podrželi a situaci posoudíme. Ozveme se vám.'}
            </p>

            {/* Co přesně zákazník nahlásil — poskytovatel to musí vidět,
                jinak nemá jak reagovat, a fotky by neměly smysl nahrávat. */}
            {(order.dispute_category || order.dispute_reason) && (
              <div className="mt-3 rounded-xl border border-orange-200 bg-white p-3">
                {order.dispute_category && (
                  <p className="text-xs font-bold uppercase tracking-wide text-orange-700">
                    {DISPUTE_LABEL[order.dispute_category] ?? 'Nahlášený problém'}
                  </p>
                )}
                {order.dispute_reason && (
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                    {order.dispute_reason}
                  </p>
                )}
                {order.dispute_photos && order.dispute_photos.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {order.dispute_photos.map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noreferrer" className="block">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url}
                          alt={`Fotka problému ${i + 1}`}
                          className="h-20 w-20 rounded-lg border border-orange-200 object-cover transition hover:opacity-90"
                        />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}
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
            <div className="space-y-2">
              <AddressInput
                defaultValue={addressInput}
                placeholder="Začněte psát adresu a vyberte ze seznamu…"
                onPick={(a) => {
                  setAddressInput(a.address)
                  setAddrCoords({ lat: a.lat, lng: a.lng })
                  setAddrSaved(false)
                }}
                onFreeText={(t) => {
                  setAddressInput(t)
                  // Ruční text bez výběru → nemáme souřadnice.
                  setAddrCoords({ lat: null, lng: null })
                  setAddrSaved(false)
                }}
              />
              <button
                onClick={handleSaveAddress}
                disabled={addrBusy}
                className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-60 sm:w-auto"
              >
                {addrBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : (hasAddress ? 'Upravit adresu' : 'Uložit adresu')}
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
        {/* isRefunded: u vrácené platby nemá smysl nabízet zaplacení — dřív se
            tenhle blok ukázal současně s hláškou „peníze jsme vrátili". */}
        {isCustomer && hasDeposit && !isRefunded && (order.status === 'prijato' || order.status === 'v_procesu') && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            {platbaStav === 'uspech' && (
              <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                <CheckCircle2 className="h-4 w-4 shrink-0" /> Platba proběhla. Potvrzení se může projevit do pár sekund – obnovte stránku.
              </div>
            )}
            {paymentInterrupted && (
              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <div className="flex items-start gap-2.5">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="font-bold">Platba nebyla dokončena.</p>
                    <p className="mt-0.5 leading-relaxed">
                      Termín pro vás zatím držíme. Můžete platbu zkusit znovu, nebo tento termín uvolnit a zvolit jiný.
                    </p>
                  </div>
                </div>
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
                  {!isModelB && (isFullPayment
                    ? ' Po zaplacení už za tento úkon na místě nic nedoplácíte.'
                    : ' Záloha se započítá do konečné ceny.')}
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
                    <button onClick={handlePay} disabled={payBusy || switchBusy} className="btn-primary w-full justify-center disabled:opacity-60">
                      {payBusy
                        ? <><Loader2 className="h-4 w-4 animate-spin" /> Přesměrovávám…</>
                        : <><CreditCard className="h-4 w-4" /> {paymentInterrupted
                            ? 'Zkusit platbu znovu'
                            : order.deposit_status === 'pending'
                              ? 'Pokračovat k platbě'
                              : `Zaplatit ${depositAmount.toLocaleString('cs-CZ')} Kč`}</>}
                    </button>

                    {/* Jiný termín není jen reakce na cancel_url. Uživatel se může
                        vrátit tlačítkem Back bez query parametru nebo se rozhodnout
                        ještě před zaplacením. Dokud není zaplaceno, tahle cesta je
                        proto dostupná vždy. */}
                    {paymentDue && !isModelB && (
                      <button
                        type="button"
                        onClick={handleChooseDifferentTerm}
                        disabled={payBusy || switchBusy}
                        className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
                      >
                        {switchBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                        Vybrat jiný termín
                      </button>
                    )}

                    {payError && <p className="mt-2 text-center text-sm text-red-600">{payError}</p>}
                    {switchErr && <p className="mt-2 text-center text-sm text-red-600">{switchErr}</p>}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Zrušení zákazníkem */}
        {canCustomerCancel && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <button
              onClick={handleCustomerCancel}
              disabled={cancelBusy}
              className="flex items-center gap-1.5 rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 transition-all hover:bg-red-50 disabled:opacity-60"
            >
              {cancelBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
              Zrušit objednávku
            </button>
            {isPaid && (
              stornoRezim && stornoCastka > 0 ? (
                <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
                  <strong>Pozor na storno poplatek.</strong> Při zrušení si poskytovatel nechá{' '}
                  <strong>{stornoCastka.toLocaleString('cs-CZ')} Kč</strong>
                  {Number(order.deposit_amount ?? depositAmount ?? 0) - stornoCastka > 0
                    ? <>, zbylých {(Number(order.deposit_amount ?? depositAmount ?? 0) - stornoCastka).toLocaleString('cs-CZ')} Kč vám vrátíme.</>
                    : <> — to je celá zaplacená částka.</>}
                </p>
              ) : jeVyrobekNaObjednavku && vyrobekStornoCastka > 0 ? (
                <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
                  <strong>Blíží se termín dodání.</strong> Při zrušení teď si poskytovatel nechá{' '}
                  <strong>{vyrobekStornoCastka.toLocaleString('cs-CZ')} Kč</strong>
                  {Number(order.deposit_amount ?? depositAmount ?? 0) - vyrobekStornoCastka > 0
                    ? <>, zbylých {(Number(order.deposit_amount ?? depositAmount ?? 0) - vyrobekStornoCastka).toLocaleString('cs-CZ')} Kč vám vrátíme.</>
                    : <> — to je celá zaplacená částka.</>}
                </p>
              ) : jeVyrobekNaObjednavku ? (
                <p className="mt-2 text-xs text-slate-400">
                  Zrušíte-li teď, vrátíme celou zaplacenou částku. Blíž k termínu dodání se vrací méně.
                </p>
              ) : (
                <p className="mt-2 text-xs text-slate-400">Zaplacená záloha vám bude vrácena.</p>
              )
            )}
            {cancelErr && <p className="mt-2 text-sm text-red-600">{cancelErr}</p>}
          </div>
        )}

        {/* ── POTVRZENÍ DOKONČENÍ (jen zákazník, stav ceka_potvrzeni) ── */}
        {muzePotvrdit && (
          <div className="rounded-2xl border border-purple-200 bg-white p-6 shadow-sm">
            <div className="mb-1 flex items-center gap-2">
              <Flag className="h-5 w-5 text-purple-600" />
              <h2 className="font-black text-slate-900">
                {jeVyrobek
                  ? (order.status === 'ceka_potvrzeni'
                      ? (productDelivery ? 'Objednávka byla doručena' : 'Objednávka byla předána')
                      : (productDelivery ? 'Dorazila objednávka v pořádku?' : 'Převzali jste objednávku?'))
                  : (order.status === 'ceka_potvrzeni'
                      ? 'Poskytovatel označil zakázku jako splněnou'
                      : 'Proběhlo všechno v pořádku?')}
              </h2>
            </div>
            <p className="mb-4 text-sm text-slate-500">
              {jeVyrobek ? (
                <>
                  Pokud jste {order.quantity > 1 ? `${order.quantity}× ` : ''}{item?.name ?? 'objednávku'}{' '}
                  {productDelivery ? 'obdrželi' : 'převzali'} a je vše v pořádku, potvrďte to.
                </>
              ) : order.status === 'ceka_potvrzeni' ? (
                <>Pokud {isModelB ? 'výjezd a nacenění proběhly' : 'řemeslník dorazil a plní zakázku'}, potvrďte to.</>
              ) : (
                <>Termín už proběhl. Potvrďte, že {isModelB ? 'výjezd a nacenění proběhly' : 'práce proběhla'} — nemusíte čekat, až to udělá řemeslník.</>
              )}
              {/* Konkrétní částka místo interního pojmu „záloha" — zákazník mohl
                  zaplatit zálohu i celou cenu. */}
              {hasDeposit && (
                <> Tím se poskytovateli uvolní{' '}
                  <strong className="text-slate-700">
                    {Number(order.deposit_amount ?? depositAmount ?? 0).toLocaleString('cs-CZ')} Kč
                  </strong>.
                </>
              )}
              {!jeVyrobek && ' Další domluva o ceně a postupu probíhá přímo s řemeslníkem.'}
            </p>
            <ConfirmCompletionButton
              orderId={order.id}
              hasDeposit={hasDeposit}
              confirmLabel={jeVyrobek ? (productDelivery ? 'Potvrdit doručení' : 'Potvrdit převzetí') : undefined}
              isProduct={jeVyrobek}
              heldAmount={Number(order.deposit_amount ?? depositAmount ?? 0)}
            />
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

      {/* Pravý sloupec: průběh + druhá strana */}
      <div className="space-y-4">

        {/* Kde v procesu jsme a co bude dál */}
        <OrderTimeline
          status={order.status}
          depositStatus={order.deposit_status}
          createdAt={order.created_at}
          scheduledAt={order.scheduled_at}
          completedAt={(order as any).completed_at ?? null}
          hasDeposit={hasDeposit}
          isCustomer={isCustomer}
          isInquiry={(order as any).is_inquiry === true}
          hasTimeProposals={hasTimeProposals}
          paymentInterrupted={paymentInterrupted}
          isProduct={jeVyrobek}
          neededAt={order.needed_at}
          isDelivery={productDelivery}
          quantity={order.quantity}
          fulfillmentStatus={order.product_fulfillment_status}
          readyAt={order.product_ready_at}
          handedOverAt={order.product_handed_over_at}
        />

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