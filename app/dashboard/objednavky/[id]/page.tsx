// app/dashboard/objednavky/[id]/page.tsx
import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { AlertTriangle, ArrowLeft } from 'lucide-react'
import OrderDetailClient from './OrderDetailClient'
import BookingStateBadge from '@/components/ui/BookingStateBadge'
import BookingProviderActions from '@/components/ui/BookingProviderActions'
import { adminDb, loadBookingOrder, resolveCaptureInProgress, syncCheckoutOnReturn } from '@/lib/booking/payments'
import ReviewForm from '@/components/ui/ReviewForm'
import TimeProposalPanel from '@/components/ui/TimeProposalPanel'
import { itemPriceKc } from '@/lib/booking/commission'
import { haversineKm } from '@/lib/geo'
import { getProposals } from '@/lib/actions/time-proposals'
import TimePreferenceForm from '@/components/ui/TimePreferenceForm'

interface Props { params: { id: string }; searchParams: { platba?: string; rezervovat?: string } }

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
  // Adresa provozovny — zákazník musí vědět, KAM si má pro výrobek dojít.
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
  scheduled_end: string | null
  slot_id: string | null
  hold_expires_at: string | null
  service_item_id: string | null
  quantity: number
  needed_at: string | null
  confirmation_deadline: string | null
  cancelled_by: string | null
  dispute_reason: string | null
  dispute_category: string | null
  dispute_photos: string[] | null
  product_fulfillment_status: string | null
  product_ready_at: string | null
  product_handed_over_at: string | null
  ready_photo_url: string | null
  services: ServiceLite | null
  service_items: {
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
}

export default async function OrderDetailPage({ params, searchParams }: Props) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/prihlasit')

  // Návrat ze Stripe přes „zpět" nic automaticky neruší.
  // Zákazník může platbu zkusit znovu; jiný termín uvolní až explicitním tlačítkem.

  const ORDER_SELECT = '*, services(id, title, price, price_unit, category, city, description, payment_model, deposit_amount, quote_fee, location_type, address, address_lat, address_lng, address_public, phone), service_items(name, price, price_unit, deposit_amount, deposit_type, payment_model, duration_minutes, quote_fee, fee_mode, item_type, stock_mode, lead_time_days, pickup_mode, pickup_timing, offer_kind, quote_fee_deductible)'

  const { data: order, error } = await supabase
    .from('orders')
    .select(ORDER_SELECT)
    .eq('id', params.id)
    .single() as { data: OrderRow | null; error: any }

  if (error || !order) notFound()
  if (order.customer_id !== user.id && order.provider_id !== user.id) notFound()

  // Model v2: po návratu ze Stripe se na stav platby zeptáme přímo Stripe – webhook mohl
  // nedorazit nebo se zdržet. Rezervaci to posune jen podle skutečného stavu ve Stripe.
  if (searchParams.platba === 'uspech' && (order as any).booking_state === 'pending_payment') {
    await syncCheckoutOnReturn(adminDb(), order.id)
    const { data: fresh } = await supabase.from('orders').select(ORDER_SELECT).eq('id', params.id).single()
    if (fresh) Object.assign(order, fresh)
  }
  // Stržení platby, které se nedopsalo (výpadek po capture): po minutě se zeptáme Stripe
  // a stav dořešíme hned při otevření, ne až pětiminutovou kontrolou.
  if ((order as any).booking_state === 'capture_in_progress'
    && new Date((order as any).state_changed_at ?? 0).getTime() < Date.now() - 60_000) {
    const db = adminDb()
    const bo = await loadBookingOrder(db, order.id)
    if (bo) {
      try { await resolveCaptureInProgress(db, bo) } catch (err) { console.error('[objednávka] dořešení capture', err) }
      const { data: fresh } = await supabase.from('orders').select(ORDER_SELECT).eq('id', params.id).single()
      if (fresh) Object.assign(order, fresh)
    }
  }

  const isProvider = order.provider_id === user.id
  const otherId = isProvider ? order.customer_id : order.provider_id

  const proposals = await getProposals(order.id)

  // Vzdálenost zákazníka mimo obvyklý dosah poskytovatele – jen informace pro poskytovatele,
  // rozhoduje on (přesná adresa, jinak obec z poptávky).
  let outOfRange: { distanceKm: number; radiusKm: number } | null = null
  if ((order as any).service_location !== 'u_poskytovatele') {
    const { data: card } = await supabase
      .from('services').select('location_type, city, city_lat, city_lng, radius_km').eq('id', (order as any).service_id).maybeSingle() as { data: { location_type: string | null; city: string | null; city_lat: number | null; city_lng: number | null; radius_km: number | null } | null }
    const atCustomer = (order as any).service_location
      ? (order as any).service_location === 'u_zakaznika'
      : card?.location_type !== 'u_poskytovatele'
    // Souřadnice obce z tabulky obce; text může obsahovat i číslo domu („Prostřední Bečva 14“).
    const obecCoords = async (text: string | null | undefined): Promise<{ lat: number; lng: number } | null> => {
      const name = String(text ?? '').split(',')[0].replace(/\s+\d+[a-zA-Z/\d]*$/, '').trim()
      if (!name) return null
      const { data: obec } = await supabase
        .from('obce').select('latitude, longitude').ilike('obec', name).limit(1).maybeSingle() as { data: { latitude: number; longitude: number } | null }
      return obec ? { lat: obec.latitude, lng: obec.longitude } : null
    }
    if (atCustomer && card?.radius_km) {
      const customer = (order as any).location_lat != null && (order as any).location_lng != null
        ? { lat: Number((order as any).location_lat), lng: Number((order as any).location_lng) }
        : await obecCoords((order as any).location_city)
      // Starší karty nemají uložené souřadnice obce – dohledáme je podle názvu.
      const base = card.city_lat != null && card.city_lng != null
        ? { lat: Number(card.city_lat), lng: Number(card.city_lng) }
        : await obecCoords(card.city)
      if (customer && base) {
        const dist = Math.round(haversineKm(base.lat, base.lng, customer.lat, customer.lng))
        if (dist > card.radius_km) outOfRange = { distanceKm: dist, radiusKm: card.radius_km }
      }
    }
  }
  const panelItem = order.service_items
  const panelModel = panelItem?.payment_model ?? order.services?.payment_model
  const panelDepositType = panelItem?.deposit_type ?? 'zaloha'
  const panelFullPayment = panelModel !== 'B' && panelDepositType === 'plna_platba'
  const depositForPanel = Number(
    order.deposit_amount ??
    (panelModel === 'B'
      ? (panelItem?.quote_fee ?? order.services?.quote_fee)
      : panelDepositType === 'bez_platby'
        ? 0
        : panelFullPayment
          ? panelItem?.price
          : (panelItem?.deposit_amount ?? order.services?.deposit_amount)) ??
    0
  )

  const proposalModel = order.service_items?.payment_model ?? order.services?.payment_model
  // Model v2: položka s typem nabídky. I výjezd (B) potřebuje termín = okno příjezdu (korekce 4).
  const v2OfferKind = ((order.service_items as any)?.offer_kind ?? (order as any).offer_kind ?? null) as string | null
  const futureConfirmedTerm = !!order.scheduled_at && new Date(order.scheduled_at).getTime() > Date.now()
  // Rezervace nového modelu s rozběhnutou nebo hotovou platbou: termín se tudy nemění
  // (změna potvrzené rezervace má vlastní pravidla, model §10).
  const v2BookingState = ((order as any).booking_state ?? null) as string | null
  const v2PaymentStarted = v2BookingState !== null && v2BookingState !== 'payment_expired'
  const proposalFlowOpen =
    !v2PaymentStarted &&
    order.status !== 'zruseno' &&
    order.status !== 'dokonceno' &&
    order.status !== 'ceka_potvrzeni' &&
    // Objednávka z veřejné poptávky nemá položku – poskytovatel ji vybere s návrhem termínu (3d).
    (proposalModel !== 'B' || v2OfferKind === 'B' || !order.service_item_id)

  // Bez termínu: provider panel vidí vždy, zákazník až když má co vybírat.
  // S potvrzeným budoucím termínem: provider má kompaktní „Navrhnout změnu",
  // zákazník panel uvidí jen tehdy, když provider opravdu poslal nové návrhy.
  const showProposalPanel = proposalFlowOpen && (
    !order.scheduled_at
      ? (isProvider || proposals.length > 0)
      : (futureConfirmedTerm && (isProvider || proposals.length > 0))
  )

  const [myProfileRes, otherProfileRes] = await Promise.all([
    supabase.from('profiles').select('id, full_name, avatar_url, phone, city, created_at').eq('id', user.id).single(),
    supabase.from('profiles').select('id, full_name, avatar_url, phone, city, created_at').eq('id', otherId).single(),
  ])
  const myProfile = myProfileRes.data as ProfileLite | null
  const otherProfile = otherProfileRes.data as ProfileLite | null

  const otherCompletedField = isProvider ? 'customer_id' : 'provider_id'
  const { count: otherCompletedCount } = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq(otherCompletedField, otherId)
    .eq('status', 'dokonceno')

  const { data: messages } = await supabase
    .from('messages')
    .select('*')
    .eq('order_id', params.id)
    .order('created_at', { ascending: true }) as { data: MessageRow[] | null }

  const senderIds = Array.from(new Set((messages ?? []).map((m) => m.sender_id)))
  const namesMap: Record<string, string> = {}
  if (myProfile?.id) namesMap[myProfile.id] = myProfile.full_name ?? 'Já'
  if (otherProfile?.id) namesMap[otherProfile.id] = otherProfile.full_name ?? (isProvider ? 'Zákazník' : 'Živnostník')
  const missing = senderIds.filter((id) => !namesMap[id])
  if (missing.length > 0) {
    const { data: extraProfiles } = await supabase
      .from('profiles').select('id, full_name, is_admin').in('id', missing) as { data: { id: string; full_name: string | null; is_admin: boolean | null }[] | null }
    for (const p of extraProfiles ?? []) {
      namesMap[p.id] = p.is_admin ? 'Propojo' : (p.full_name ?? 'Uživatel')
    }
  }

  const isCustomer = order.customer_id === user.id
  let canReview = false
  if (isCustomer && order.status === 'dokonceno') {
    const { data: existingReview } = await supabase
      .from('reviews')
      .select('id')
      .eq('order_id', params.id)
      .maybeSingle() as { data: { id: string } | null }
    canReview = !existingReview
  }

  return (
    <div className="space-y-4">
      <Link href="/dashboard/objednavky" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Zpět na objednávky
      </Link>

      {/* Poskytovatel u čekající rezervace: stav i akce jsou ve velkém bloku níž – bez duplicity */}
      {!(isProvider && (order as any).booking_state === 'awaiting_confirmation') && <BookingStateBadge
        state={(order as any).booking_state ?? null}
        isProvider={isProvider}
        confirmDeadlineAt={(order as any).confirm_deadline_at ?? null}
        paymentReturned={searchParams.platba === 'uspech'}
        authorizedAt={(order as any).authorized_at ?? null}
        confirmedAt={(order as any).confirmed_at ?? null}
        cancelReason={(order as any).cancel_reason ?? null}
      />}

      {/* Vzdálenost mimo obvyklý dosah – výrazně pro poskytovatele; zákazníkovi jen u čekající rezervace */}
      {outOfRange && !['confirmed', 'declined', 'expired', 'cancelled', 'capture_failed'].includes(v2BookingState ?? '') && order.status !== 'zruseno' && order.status !== 'dokonceno'
        && (isProvider || v2BookingState === 'awaiting_confirmation') && (
        <div className="flex items-start gap-3 rounded-2xl border-2 border-orange-400 bg-orange-50 px-4 py-3.5 text-sm text-orange-950">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-orange-600" />
          <div>
            <p className="font-black">Pozor, je to daleko – asi {outOfRange.distanceKm} km</p>
            <p className="mt-0.5 leading-relaxed">
              {isProvider
                ? <>Adresa je mimo váš obvyklý dosah {outOfRange.radiusKm} km (vzdušnou čarou).
                    {v2BookingState === 'awaiting_confirmation'
                      ? ' Potvrďte jen, pokud tam opravdu dojedete – jinak rezervaci odmítněte a zákazníkovi se blokace uvolní.'
                      : ' Jestli zakázku vezmete a za jakých podmínek, je na vás – domluvit se můžete ve zprávách.'}</>
                : <>Adresa je mimo obvyklý dosah poskytovatele ({outOfRange.radiusKm} km). Rezervaci proto potvrzuje ručně – částka je zatím
                    jen zablokovaná. Když tam nedojede, rezervaci odmítne a blokace se uvolní, nic nezaplatíte.</>}
            </p>
          </div>
        </div>
      )}

      {isProvider && (order as any).booking_state === 'awaiting_confirmation' && (
        <BookingProviderActions
          orderId={order.id}
          amountKc={Number((order as any).charge_halere ?? 0) / 100}
          feeKc={(order as any).application_fee_halere != null ? Number((order as any).application_fee_halere) / 100 : null}
          deadlineAt={(order as any).confirm_deadline_at ?? null}
          offerKind={(order as any).offer_kind ?? null}
          quoteFeeDeductible={(order as any).quote_fee_deductible === true}
        />
      )}

      {canReview && <ReviewForm orderId={order.id} />}

      {showProposalPanel && (
        <TimeProposalPanel
          orderId={order.id}
          isProvider={isProvider}
          proposals={proposals}
          depositAmount={v2OfferKind
            ? (panelItem
                ? (itemPriceKc({ offer_kind: v2OfferKind, deposit_amount: panelItem.deposit_amount ?? null, quote_fee: panelItem.quote_fee ?? null }) ?? 0)
                : Number((order as any).agreed_charge_halere ?? 0) / 100)
            : depositForPanel}
          scheduledAt={order.scheduled_at}
          depositStatus={order.deposit_status}
          itemName={order.service_items?.name ?? order.services?.title ?? null}
          customerName={isProvider ? (otherProfile?.full_name ?? null) : null}
          prefFrom={(order as any).pref_date_from ?? null}
          prefTo={(order as any).pref_date_to ?? null}
          prefTime={(order as any).pref_time ?? null}
          arrivalWindow={v2OfferKind === 'B'}
          paymentLabel={v2OfferKind ? (v2OfferKind === 'B' ? 'Cenu výjezdu' : 'Rezervační poplatek') : null}
          paymentNote={v2OfferKind === 'A'
            ? 'odečte se z ceny služby'
            : v2OfferKind === 'B'
              ? ((((order as any).quote_fee_deductible ?? (order.service_items as any)?.quote_fee_deductible) === true)
                  ? 'odečte se z ceny zakázky'
                  : 'do ceny zakázky se nezapočítává')
              : null}
          customerPlace={isProvider ? ((order as any).location_city ?? null) : null}
          askDuration={!order.service_item_id}
          autoOpenStart={!isProvider ? (searchParams.rezervovat ?? null) : null}
          defaultDuration={Number((order.service_items as any)?.duration_minutes ?? 0) || 60}
          outOfRange={isProvider ? outOfRange : null}
        />
      )}

      {/* Preference zákazníka jen před prvním potvrzeným termínem. */}
      {isCustomer && !order.scheduled_at && order.status === 'cekajici' && proposals.length === 0 && (
        <TimePreferenceForm
          orderId={order.id}
          initialFrom={(order as any).pref_date_from ?? null}
          initialTo={(order as any).pref_date_to ?? null}
          initialTimePref={(order as any).pref_time ?? null}
        />
      )}

      <OrderDetailClient
        order={order}
        myProfile={myProfile}
        otherProfile={otherProfile}
        otherCompletedCount={otherCompletedCount ?? 0}
        initialMessages={messages ?? []}
        senderNames={namesMap}
        isProvider={isProvider}
        userId={user.id}
        platbaStav={searchParams.platba ?? null}
      />
    </div>
  )
}