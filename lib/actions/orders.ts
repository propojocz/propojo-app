'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { newOrderEmail, orderPlacedEmail, orderStatusEmail } from '@/lib/email/templates'
import type { ActionResult, OrderStatus } from './types'
import { createNotification } from '@/lib/actions/notifications'
import { refundDeposit } from '@/lib/actions/payout'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://propojo.cz'

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function getUserEmail(userId: string): Promise<string | null> {
  try {
    const admin = getAdminClient()
    const { data, error } = await admin.auth.admin.getUserById(userId)
    if (error || !data?.user?.email) return null
    return data.user.email
  } catch {
    return null
  }
}

// ── Formátování pro e-maily ────────────────────────────────
function fmtPrice(price?: number | null, unit?: string | null, isModelB?: boolean): string | undefined {
  if (isModelB) return 'Nacenění na místě'
  const p = Number(price ?? 0)
  if (p <= 0) return 'Dohodou'
  return unit ? `${p.toLocaleString('cs-CZ')} Kč/${unit}` : `${p.toLocaleString('cs-CZ')} Kč`
}

function fmtMoney(amount?: number | null): string | undefined {
  const a = Number(amount ?? 0)
  return a > 0 ? `${a.toLocaleString('cs-CZ')} Kč` : undefined
}

function fmtDate(iso?: string | null): string | undefined {
  if (!iso) return undefined
  try {
    return new Date(iso).toLocaleString('cs-CZ', {
      day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  } catch { return undefined }
}

// Krátký popis storno podmínek do e-mailu.
// (Musí odpovídat tomu, co vidí zákazník u služby — kdyby se lišilo, je to matoucí.)
const CANCELLATION_TEXT: Record<string, string> = {
  zadna: 'Zrušit můžete kdykoli, záloha se vrací v plné výši.',
  mirna: 'Při zrušení více než 24 hodin předem se záloha vrací v plné výši.',
  standardni: 'Při zrušení více než 48 hodin předem se záloha vrací v plné výši.',
  prisna: 'Při zrušení méně než 7 dní předem záloha propadá živnostníkovi.',
}

async function sendNotification(to: string, subject: string, html: string) {
  if (!process.env.RESEND_API_KEY) return
  try {
    const resend = new Resend(process.env.RESEND_API_KEY)
    const { error } = await resend.emails.send({
      from: 'Propojo <notifikace@propojo.cz>',
      to,
      subject,
      html,
    })
    if (error) console.error('[email]', error)
  } catch (err) {
    console.error('[email] neočekávaná chyba:', err)
  }
}

export async function createOrder(values: {
  service_id: string
  provider_id: string
  message?: string
  scheduled_at?: string
  price_agreed?: number
  location_city?: string
  service_location?: string
}): Promise<ActionResult> {
  const supabase = createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, error: 'Pro objednávku musíte být přihlášeni.' }

  // Pojistka: nelze objednat sám u sebe.
  if (values.provider_id === user.id) {
    return { success: false, error: 'Nemůžete si objednat vlastní službu.' }
  }

  const { data: providerProfile } = await supabase
    .from('profiles')
    .select('is_suspended')
    .eq('id', values.provider_id)
    .single() as { data: { is_suspended: boolean | null } | null }

  if (providerProfile?.is_suspended === true) {
    return { success: false, error: 'Tento poskytovatel není momentálně dostupný.' }
  }

  const { data, error } = await supabase
    .from('orders')
    .insert({
      service_id: values.service_id,
      provider_id: values.provider_id,
      customer_id: user.id,
      description: values.message ?? null,
      total_price: values.price_agreed ?? null,
      location_city: values.location_city ?? null,
      service_location: values.service_location ?? null,
      status: 'cekajici',
    } as any)
    .select('id')
    .single() as { data: { id: string } | null; error: any }

  if (error || !data) {
    console.error('[createOrder]', error)
    return { success: false, error: 'Objednávku se nepodařilo vytvořit.' }
  }

  try {
    const { data: senderProfile } = await supabase
      .from('profiles').select('full_name').eq('id', user.id).single() as { data: { full_name: string | null } | null }
    const { data: svc } = await supabase
      .from('services').select('title').eq('id', values.service_id).single() as { data: { title: string | null } | null }

    await createNotification({
      userId: values.provider_id,
      type: 'status_change',
      orderId: data.id,
      actorId: user.id,
      title: `Nová objednávka od ${senderProfile?.full_name ?? 'zákazníka'}`,
      preview: svc?.title ?? null,
    })
  } catch (err) {
    console.error('[createOrder] notifikace:', err)
  }

  try {
    const [
      { data: service },
      { data: clientProfile },
      { data: providerRow },
      providerEmail,
    ] = await Promise.all([
      supabase.from('services').select('title, price, price_unit, city, payment_model').eq('id', values.service_id).single(),
      supabase.from('profiles').select('full_name').eq('id', user.id).single(),
      // Tři jména: marketingový název + ověřená identita z ARES
      supabase.from('profiles').select('full_name, display_name, company_name, ico').eq('id', values.provider_id).single(),
      getUserEmail(values.provider_id),
    ])

    const sv = service as any
    const pr = providerRow as any
    const clientName = (clientProfile as any)?.full_name ?? 'Zákazník'

    const providerDisplayName = pr?.display_name || pr?.company_name || pr?.full_name || 'Živnostník'
    const providerLegalName = pr?.company_name || pr?.full_name || null
    const isModelB = sv?.payment_model === 'B'
    const city = values.location_city ?? sv?.city ?? undefined

    // a) ŽIVNOSTNÍKOVI — máte novou objednávku
    if (sv && providerEmail) {
      const { subject, html } = newOrderEmail({
        providerName: providerDisplayName,
        clientName,
        serviceTitle: sv.title,
        message: values.message,
        price: sv.price,
        priceUnit: sv.price_unit,
        city: city ?? '—',
        orderUrl: `${APP_URL}/dashboard/objednavky`,
      })
      await sendNotification(providerEmail, subject, html)
    }

    // b) ZÁKAZNÍKOVI — potvrzení, že objednávka odešla (dřív nedostal NIC).
    //    Už tady uvádíme, s kým bude smlouva — ať to má v ruce od začátku.
    if (sv && user.email) {
      const { subject, html } = orderPlacedEmail({
        clientName,
        serviceTitle: sv.title,
        providerDisplayName,
        providerLegalName,
        providerIco: pr?.ico ?? null,
        priceText: fmtPrice(values.price_agreed ?? sv.price, sv.price_unit, isModelB),
        city,
        orderUrl: `${APP_URL}/dashboard/objednavky`,
        isModelB,
      })
      await sendNotification(user.email, subject, html)
    }
  } catch (err) {
    console.error('[createOrder] e-mail:', err)
  }

  revalidatePath('/dashboard/objednavky')
  return { success: true, id: data.id }
}

export async function updateOrderStatus(orderId: string, status: OrderStatus): Promise<ActionResult> {
  const supabase = createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, error: 'Nejste přihlášeni.' }

  // Načteme objednávku pro kontroly
  const { data: ordCheck } = await supabase
    .from('orders')
    .select('customer_id, provider_id, deposit_status, slot_id, services(payment_model, deposit_amount, quote_fee)')
    .eq('id', orderId)
    .single() as { data: any }

  if (!ordCheck) return { success: false, error: 'Objednávka nenalezena.' }

  const isProvider = ordCheck.provider_id === user.id
  const isCustomer = ordCheck.customer_id === user.id

  // Při PŘIJETÍ: nastavíme deposit_status='pending' když je co platit
  let extraUpdate: Record<string, any> = {}
  if (status === 'prijato') {
    const svc = ordCheck.services
    const amount = svc?.payment_model === 'B'
      ? Number(svc?.quote_fee ?? 0)
      : Number(svc?.deposit_amount ?? 0)
    if (amount > 0) extraUpdate = { deposit_status: 'pending' }
  }

  // Do 'v_procesu' jen když je záloha zaplacená (nebo žádná není potřeba)
  if (status === 'v_procesu' && ordCheck.deposit_status === 'pending') {
    return { success: false, error: 'Práci lze zahájit až po úhradě zálohy zákazníkem.' }
  }

  // Status 'dokonceno' se NEnastavuje napřímo – děje se přes potvrzení zákazníka (releaseDeposit).
  if (status === 'dokonceno') {
    return { success: false, error: 'Dokončení potvrzuje zákazník.' }
  }

  // ZRUŠENÍ: smí poskytovatel i zákazník; když je záloha zaplacená → refund (4a: plná vratka)
  if (status === 'zruseno') {
    if (!isProvider && !isCustomer) {
      return { success: false, error: 'K této objednávce nemáte přístup.' }
    }
    if (ordCheck.deposit_status === 'paid') {
      const refundRes = await refundDeposit(orderId, user.id)
      if (!refundRes.success) return refundRes
    }
    const { error: cancelErr } = await (getAdminClient().from('orders') as any)
      .update({ status: 'zruseno' })
      .eq('id', orderId)
    if (cancelErr) {
      console.error('[updateOrderStatus] cancel:', cancelErr)
      return { success: false, error: 'Nepodařilo se zrušit objednávku.' }
    }
    // Byla-li objednávka vázaná na rezervovaný termín, uvolni ho zpět jako volný
    if (ordCheck.slot_id) {
      await (getAdminClient().from('availability_slots') as any)
        .update({ status: 'volno', order_id: null })
        .eq('id', ordCheck.slot_id)
    }
    revalidatePath('/dashboard/objednavky')
    revalidatePath(`/dashboard/objednavky/${orderId}`)
    revalidatePath('/dashboard/terminy')
    return { success: true, id: orderId }
  }

  // Ostatní změny stavu smí jen poskytovatel
  if (!isProvider) {
    return { success: false, error: 'Tuto akci může provést jen poskytovatel.' }
  }

  const { error } = await (supabase.from('orders') as any)
    .update({ status, ...extraUpdate })
    .eq('id', orderId)
    .eq('provider_id', user.id)

  if (error) {
    console.error('[updateOrderStatus]', error)
    return { success: false, error: 'Nepodařilo se změnit stav.' }
  }

  // Notifikace zákazníkovi
  try {
    const STATUS_TEXT: Record<string, string> = {
      prijato: 'Vaše objednávka byla přijata',
      v_procesu: 'Práce na vaší objednávce byla zahájena',
      ceka_potvrzeni: 'Živnostník označil zakázku za hotovou – potvrďte prosím',
      dokonceno: 'Objednávka je dokončená',
      zruseno: 'Vaše objednávka byla zrušena',
      spor: 'U objednávky evidujeme spor',
    }
    if (ordCheck.customer_id !== user.id) {
      const { data: svc } = await supabase
        .from('orders').select('services(title)').eq('id', orderId).single() as { data: any }
      await createNotification({
        userId: ordCheck.customer_id,
        type: 'status_change',
        orderId,
        actorId: user.id,
        title: STATUS_TEXT[status] ?? 'Změna stavu objednávky',
        preview: svc?.services?.title ?? null,
      })
    }
  } catch (err) {
    console.error('[updateOrderStatus] notifikace:', err)
  }

  // ── E-MAIL ZÁKAZNÍKOVI ────────────────────────────────────────────
  // U stavu 'prijato' je to PRÁVNĚ NEJDŮLEŽITĚJŠÍ e-mail celé aplikace:
  // je to doklad o tom, že závazek vznikl — a S KÝM. Proto tam posíláme
  // plnou ověřenou identitu živnostníka (jméno z ARES + IČO), ne jen
  // marketingový název. Na kartě smí být „Salon Bella"; v e-mailu, kde
  // zákazník drží v ruce závazek, musí vědět, kdo za tím stojí.
  try {
    const { data: order } = await supabase
      .from('orders')
      .select(`
        customer_id,
        scheduled_at,
        location_city,
        total_price,
        services(title, price, price_unit, payment_model, deposit_amount, quote_fee, cancellation_policy, city),
        profiles!orders_provider_id_fkey(full_name, display_name, company_name, ico, phone)
      `)
      .eq('id', orderId)
      .single() as { data: any }

    if (order) {
      const [clientEmail, { data: clientProfile }] = await Promise.all([
        getUserEmail(order.customer_id),
        supabase.from('profiles').select('full_name').eq('id', order.customer_id).single(),
      ])

      if (clientEmail) {
        const sv = order.services ?? {}
        const pr = order.profiles ?? {}
        const isModelB = sv.payment_model === 'B'

        const providerDisplayName = pr.display_name || pr.company_name || pr.full_name || 'Živnostník'
        const providerLegalName = pr.company_name || pr.full_name || null

        // Záloha (Model A) nebo poplatek za nacenění (Model B)
        const depositAmount = isModelB ? sv.quote_fee : sv.deposit_amount
        const depositLabel = fmtMoney(depositAmount)

        const { subject, html } = orderStatusEmail({
          clientName: (clientProfile as any)?.full_name ?? 'Zákazník',
          serviceTitle: sv.title ?? 'Služba',
          providerName: providerDisplayName,
          status,
          orderUrl: `${APP_URL}/dashboard/objednavky/${orderId}`,

          // ── ověřená identita — jádro celé věci ──
          providerLegalName,
          providerIco: pr.ico ?? null,
          providerPhone: pr.phone ?? null,

          // ── detaily závazku ──
          priceText: fmtPrice(order.total_price ?? sv.price, sv.price_unit, isModelB),
          depositText: depositLabel ? `${depositLabel}${isModelB ? ' (za nacenění)' : ' (započítá se do ceny)'}` : undefined,
          scheduledAt: fmtDate(order.scheduled_at),
          city: order.location_city ?? sv.city ?? undefined,
          cancellationText: sv.cancellation_policy ? CANCELLATION_TEXT[sv.cancellation_policy] : undefined,
        })
        await sendNotification(clientEmail, subject, html)
      }
    }
  } catch (err) {
    console.error('[updateOrderStatus] e-mail:', err)
  }

  revalidatePath('/dashboard/objednavky')
  revalidatePath(`/dashboard/objednavky/${orderId}`)
  return { success: true, id: orderId }
}

// ── DOPLNĚNÍ PŘESNÉ ADRESY ZÁKAZNÍKEM (po přijetí, před platbou) ──
export async function setOrderAddress(orderId: string, address: string): Promise<ActionResult> {
  const supabase = createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, error: 'Nejste přihlášeni.' }

  const trimmed = address.trim()
  if (trimmed.length < 5) return { success: false, error: 'Zadejte prosím úplnou adresu (ulice a číslo).' }

  const { data: order } = await supabase
    .from('orders')
    .select('customer_id, status')
    .eq('id', orderId)
    .single() as { data: { customer_id: string; status: string } | null }

  if (!order) return { success: false, error: 'Objednávka nenalezena.' }
  if (order.customer_id !== user.id) {
    return { success: false, error: 'Adresu může doplnit jen zákazník objednávky.' }
  }

  const { error } = await (supabase.from('orders') as any)
    .update({ location_address: trimmed })
    .eq('id', orderId)
    .eq('customer_id', user.id)

  if (error) {
    console.error('[setOrderAddress]', error)
    return { success: false, error: 'Adresu se nepodařilo uložit.' }
  }

  revalidatePath(`/dashboard/objednavky/${orderId}`)
  return { success: true, id: orderId }
}

export async function sendOrderMessage(
  orderId: string,
  content: string,
  imageUrl?: string | null
): Promise<ActionResult & { message?: any }> {
  const supabase = createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, error: 'Nejste přihlášeni.' }

  const trimmed = content.trim()
  const img = imageUrl?.trim() || null
  // Zpráva musí mít aspoň text NEBO fotku
  if (!trimmed && !img) return { success: false, error: 'Zpráva je prázdná.' }

  const { data, error } = await (supabase.from('messages') as any)
    .insert({
      order_id: orderId,
      sender_id: user.id,
      content: trimmed,
      image_url: img,
    })
    .select('*')
    .single() as { data: any; error: any }

  if (error || !data) {
    console.error('[sendOrderMessage]', error)
    return { success: false, error: 'Zprávu se nepodařilo odeslat.' }
  }

  try {
    const { data: order } = await supabase
      .from('orders')
      .select('customer_id, provider_id, services(title)')
      .eq('id', orderId)
      .single() as { data: any }

    if (order) {
      const recipientId = order.customer_id === user.id ? order.provider_id : order.customer_id
      const { data: senderProfile } = await supabase
        .from('profiles').select('full_name').eq('id', user.id).single() as { data: { full_name: string | null } | null }

      await createNotification({
        userId: recipientId,
        type: 'new_message',
        orderId,
        actorId: user.id,
        title: `Nová zpráva od ${senderProfile?.full_name ?? 'uživatele'}`,
        preview: trimmed ? (trimmed.length > 80 ? trimmed.slice(0, 80) + '…' : trimmed) : '📷 Fotka',
      })
    }
  } catch (err) {
    console.error('[sendOrderMessage] notifikace:', err)
  }

  revalidatePath(`/dashboard/objednavky/${orderId}`)
  return { success: true, id: data.id, message: data }
}