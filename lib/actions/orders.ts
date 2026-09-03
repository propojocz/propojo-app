'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { newOrderEmail, orderPlacedEmail, orderStatusEmail } from '@/lib/email/templates'
import type { ActionResult, OrderStatus } from './types'
import { createNotification } from '@/lib/actions/notifications'
import { refundDeposit } from '@/lib/actions/payout'
import { datumCas } from '@/lib/format'

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

// Čas termínu do e-mailu. Přes lib/format.ts — e-mail se skládá na serveru,
// který běží v UTC, a bez pevné zóny by zákazníkovi dorazilo potvrzení
// s časem o dvě hodiny dřív, než na kdy je objednaný.
function fmtDate(iso?: string | null): string | undefined {
  if (!iso) return undefined
  const text = datumCas(iso)
  return text === '—' ? undefined : text
}

// ── Storno podmínky do e-mailu ─────────────────────────────
// Dřív se braly z services.cancellation_policy (žádná/mírná/standardní/přísná
// s lhůtami 24 h / 48 h / 7 dní). To pole ale NIC neřídilo — žádná lhůta se
// nikde nepočítala a žádné peníze se podle ní nestrhávaly. Zákazníkovi tedy
// chodila e-mailem podmínka, která neplatila, a ve sporu by to bylo proti nám.
//
// Skutečná pravidla drží ÚKON: fee_mode ('storno' | 'noshow' | 'zadny')
// a no_show_fee. Vypořádání dělá payout.ts — poplatek jde poskytovateli,
// zbytek zpět zákazníkovi. Text v mailu teď říká přesně tohle, tedy totéž,
// co zákazník viděl v objednávkovém okně.
function stornoText(
  feeMode?: string | null,
  fee?: number | null,
  deposit?: number | null
): string | undefined {
  const poplatek = Number(fee ?? 0)
  const zaloha = Number(deposit ?? 0)

  // Není z čeho strhávat ani co vracet → o storno podmínkách mlčíme.
  if (poplatek <= 0 || feeMode === 'zadny' || !feeMode) {
    return zaloha > 0 ? 'Zrušit můžete kdykoli — záloha se vrací v plné výši.' : undefined
  }

  const castka = poplatek.toLocaleString('cs-CZ')
  if (feeMode === 'storno') {
    return zaloha > poplatek
      ? `Když termín zrušíte příliš pozdě, živnostník si účtuje ${castka} Kč; zbytek zálohy se vrací.`
      : `Když termín zrušíte příliš pozdě, živnostník si účtuje ${castka} Kč.`
  }
  return zaloha > poplatek
    ? `Když nedorazíte a neozvete se, živnostník si účtuje ${castka} Kč; zbytek zálohy se vrací.`
    : `Když nedorazíte a neozvete se, živnostník si účtuje ${castka} Kč.`
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

// Úkon z ceníku, pokud je objednávka vázaná na konkrétní položku.
type ItemSnapshot = {
  name: string | null
  price: number | null
  price_unit: string | null
  deposit_amount: number | null
  payment_model: string | null
} | null

async function loadItem(supabase: any, itemId?: string): Promise<ItemSnapshot> {
  if (!itemId) return null
  const { data } = await supabase
    .from('service_items')
    .select('name, price, price_unit, deposit_amount, payment_model')
    .eq('id', itemId)
    .single()
  return (data as ItemSnapshot) ?? null
}

export async function createOrder(values: {
  service_id: string
  provider_id: string
  service_item_id?: string          // NOVÉ: objednávka konkrétního úkonu z ceníku
  message?: string
  scheduled_at?: string
  price_agreed?: number
  location_city?: string
  service_location?: string
  /** Nákup na firmu — SNAPSHOT údajů odběratele k objednávce. Ukládá se kopie,
   *  ne odkaz na profil: doklad musí sedět na stav v době nákupu. */
  billing?: {
    is_company: boolean
    name?: string | null
    ico?: string | null
    dic?: string | null
    address?: string | null
  }
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

  // ── Úkon (pokud objednáváme konkrétní položku ceníku) ──
  // Cena i model se berou z ÚKONU, ne z karty. Když item chybí (starý tok),
  // spadneme zpět na price_agreed z karty.
  const item = await loadItem(supabase, values.service_item_id)
  const itemIsModelB = item?.payment_model === 'B'
  // Cena objednávky: u modelu B se nefixuje (nacenění), jinak cena úkonu.
  const orderPrice = item
    ? (itemIsModelB ? null : (item.price ?? null))
    : (values.price_agreed ?? null)

  const { data, error } = await supabase
    .from('orders')
    .insert({
      service_id: values.service_id,
      service_item_id: values.service_item_id ?? null,
      provider_id: values.provider_id,
      customer_id: user.id,
      description: values.message ?? null,
      total_price: orderPrice,
      // Zálohu z úkonu uložíme rovnou na objednávku — poskytovatel pak na
      // detailu vidí přesnou částku, kterou zákazník platí, a na místě se
      // vyrovnají jen o zbytek.
      deposit_amount: item ? (itemIsModelB ? null : (item.deposit_amount ?? null)) : null,
      location_city: values.location_city ?? null,
      service_location: values.service_location ?? null,
      billing_is_company: values.billing?.is_company === true,
      billing_name: values.billing?.name?.trim() || null,
      billing_ico: values.billing?.ico?.trim() || null,
      billing_dic: values.billing?.dic?.trim() || null,
      billing_address: values.billing?.address?.trim() || null,
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

    // V notifikaci upřednostníme název úkonu (to si zákazník objednal), fallback název karty.
    const orderedName = item?.name || svc?.title || null

    // a) POSKYTOVATELI — přišla nová objednávka.
    await createNotification({
      userId: values.provider_id,
      type: 'status_change',
      orderId: data.id,
      actorId: user.id,
      title: `Nová objednávka od ${senderProfile?.full_name ?? 'zákazníka'}`,
      preview: orderedName,
    })

    // b) ZÁKAZNÍKOVI — in-app potvrzení, že objednávka odešla (kromě e-mailu).
    // Actor = poskytovatel, na kterého teď zákazník čeká (z něj se vezme avatar/odkaz).
    await createNotification({
      userId: user.id,
      type: 'status_change',
      orderId: data.id,
      actorId: values.provider_id,
      title: 'Objednávka odeslána',
      preview: orderedName,
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
      supabase.from('profiles').select('full_name, display_name, company_name, ico').eq('id', values.provider_id).single(),
      getUserEmail(values.provider_id),
    ])

    const sv = service as any
    const pr = providerRow as any
    const clientName = (clientProfile as any)?.full_name ?? 'Zákazník'

    const providerDisplayName = pr?.display_name || pr?.company_name || pr?.full_name || 'Živnostník'
    const providerLegalName = pr?.company_name || pr?.full_name || null

    // Model B i cena/jednotka se berou z ÚKONU, když existuje; jinak z karty (starý tok).
    const isModelB = item ? itemIsModelB : sv?.payment_model === 'B'
    const emailTitle = item?.name || sv?.title || 'Služba'
    const emailPrice = item ? item.price : sv?.price
    const emailUnit = item ? item.price_unit : sv?.price_unit
    const city = values.location_city ?? sv?.city ?? undefined

    // a) ŽIVNOSTNÍKOVI — máte novou objednávku
    if (sv && providerEmail) {
      const { subject, html } = newOrderEmail({
        providerName: providerDisplayName,
        clientName,
        serviceTitle: emailTitle,
        message: values.message,
        price: emailPrice,
        priceUnit: emailUnit,
        city: city ?? '—',
        orderUrl: `${APP_URL}/dashboard/objednavky`,
      })
      await sendNotification(providerEmail, subject, html)
    }

    // b) ZÁKAZNÍKOVI — potvrzení, že objednávka odešla.
    if (sv && user.email) {
      const { subject, html } = orderPlacedEmail({
        clientName,
        serviceTitle: emailTitle,
        providerDisplayName,
        providerLegalName,
        providerIco: pr?.ico ?? null,
        priceText: fmtPrice(orderPrice ?? emailPrice, emailUnit, isModelB),
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

  // Načteme objednávku pro kontroly.
  // deposit_amount / quote_fee bereme z ÚKONU (service_items) když je objednávka
  // vázaná na položku; jinak fallback na kartu (services) — starý tok.
  const { data: ordCheck } = await supabase
    .from('orders')
    .select('customer_id, provider_id, attendance, deposit_status, slot_id, service_item_id, scheduled_at, services(payment_model, deposit_amount, quote_fee), service_items(payment_model, deposit_amount, quote_fee, deposit_type, price, item_type)')
    .eq('id', orderId)
    .single() as { data: any }

  if (!ordCheck) return { success: false, error: 'Objednávka nenalezena.' }

  const isProvider = ordCheck.provider_id === user.id
  const isCustomer = ordCheck.customer_id === user.id

  // Kolik se u téhle objednávky očekává zaplatit. Používá se na dvou místech —
  // při přijetí (zapnutí platby) a při uzavírání (kontrola, že peníze dorazily).
  const itX = ordCheck.service_items
  const svcX = ordCheck.services
  const modelX = itX?.payment_model ?? svcX?.payment_model
  const fullPayX = modelX !== 'B' && (itX as any)?.deposit_type === 'plna_platba'
  const ocekavanaCastka = modelX === 'B'
    ? Number(itX?.quote_fee ?? svcX?.quote_fee ?? 0)      // poplatek za nacenění
    : fullPayX
      ? Number((itX as any)?.price ?? 0)                   // celá cena předem
      : Number(itX?.deposit_amount ?? svcX?.deposit_amount ?? 0)  // záloha

  // Při PŘIJETÍ: nastavíme deposit_status='pending' když je co platit
  let extraUpdate: Record<string, any> = {}
  if (status === 'prijato') {
    // Přijmout (a spustit platbu) jde jen s domluveným termínem. Bez něj by
    // vznikla zaplacená objednávka bez času → spory. Poskytovatel musí nejdřív
    // navrhnout termín (panel návrhu), zákazník ho přijme a tím vznikne scheduled_at.
    if (!ordCheck.scheduled_at && modelX !== 'B') {
      return { success: false, error: 'Nejdřív zákazníkovi navrhněte termín — bez domluveného času nejde objednávku přijmout ani platit.' }
    }
    if (ocekavanaCastka > 0) extraUpdate = { deposit_status: 'pending', deposit_amount: ocekavanaCastka }
  }

  // Do 'v_procesu' jen když je záloha zaplacená (nebo žádná není potřeba)
  if (status === 'v_procesu' && ordCheck.deposit_status === 'pending') {
    return { success: false, error: 'Práci lze zahájit až po úhradě zálohy zákazníkem.' }
  }

  // Poskytovatel označil hotovo → uložíme okamžik. Od něj běží 7denní lhůta,
  // po které se záloha uvolní i bez potvrzení zákazníka (autoReleaseStaleDeposits).
  // (status as string) — hodnotu 'ceka_potvrzeni' zatím nemusí znát typ OrderStatus.
  if ((status as string) === 'ceka_potvrzeni') {
    // VÝROBEK má vlastní cestu: 'připraveno' → 'předáno' (markProductHandedOver).
    // Teprve předání smí spustit dvoudenní automat na výplatu — kdyby se sem dalo
    // vstoupit obecným uzavřením, provider by dostal peníze za nevyzvednuté zboží.
    if (ordCheck.service_items?.item_type === 'product') {
      return {
        success: false,
        error: 'U výrobku potvrďte předání zákazníkovi — tím se objednávka uzavře.',
      }
    }

    // Uzavřít jde jen ZAPLACENOU zakázku — jinak by výplata neměla z čeho vyjít.
    //
    // Neptáme se JEN na deposit_status === 'pending'. Ten se totiž nastavuje až
    // při přijetí objednávky, a když objednávka vznikla jinou cestou (zákazník
    // si vzal volné okno), zůstane prázdný — a kontrola by prošla i bez platby.
    // Proto rozhodujeme podle očekávané částky: má-li se platit, musí být zaplaceno.
    const zaplaceno = ordCheck.deposit_status === 'paid' || ordCheck.deposit_status === 'released'
    if (ocekavanaCastka > 0 && !zaplaceno) {
      return { success: false, error: 'Zakázku lze uzavřít až po úhradě od zákazníka. Zatím nedorazila platba.' }
    }
    extraUpdate = { ...extraUpdate, completed_at: new Date().toISOString() }
  }

  // Status 'dokonceno' se NEnastavuje napřímo – děje se přes potvrzení zákazníka.
  if (status === 'dokonceno') {
    return { success: false, error: 'Dokončení potvrzuje zákazník.' }
  }

  // ZRUŠENÍ: smí poskytovatel i zákazník; když je záloha zaplacená → refund
  if (status === 'zruseno') {
    if (!isProvider && !isCustomer) {
      return { success: false, error: 'K této objednávce nemáte přístup.' }
    }
    // Zákazník NESMÍ zrušit, když je označené nedostavení — refund by mu vrátil
    // zálohu, která má jako storno jít poskytovateli. Řeší se přes 24h lhůtu.
    if (!isProvider && (ordCheck as any).attendance === 'nedorazil') {
      return { success: false, error: 'Objednávku teď nelze zrušit — je označené nedostavení. Pokud s tím nesouhlasíte, ozvěte se v objednávce; máte 24 hodin.' }
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
    if (ordCheck.slot_id) {
      await (getAdminClient().from('availability_slots') as any)
        .update({ status: 'volno', order_id: null })
        .eq('id', ordCheck.slot_id)
    }
    // Zrušit může zákazník i poskytovatel — druhá strana se to musí dozvědět.
    try {
      const recipientId = user.id === ordCheck.customer_id ? ordCheck.provider_id : ordCheck.customer_id
      const { data: svc } = await getAdminClient()
        .from('orders').select('services(title), service_items(name)').eq('id', orderId).single() as { data: any }
      const nm = svc?.service_items?.name || svc?.services?.title || null
      const byCustomer = user.id === ordCheck.customer_id
      await createNotification({
        userId: recipientId,
        type: 'status_change',
        orderId,
        actorId: user.id,
        title: byCustomer ? 'Zákazník zrušil objednávku' : 'Poskytovatel zrušil objednávku',
        preview: nm,
      })
    } catch (err) {
      console.error('[updateOrderStatus] cancel notifikace:', err)
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
        .from('orders').select('services(title), service_items(name)').eq('id', orderId).single() as { data: any }
      const nm = svc?.service_items?.name || svc?.services?.title || null
      await createNotification({
        userId: ordCheck.customer_id,
        type: 'status_change',
        orderId,
        actorId: user.id,
        title: STATUS_TEXT[status] ?? 'Změna stavu objednávky',
        preview: nm,
      })
    }
  } catch (err) {
    console.error('[updateOrderStatus] notifikace:', err)
  }

  // ── E-MAIL ZÁKAZNÍKOVI ────────────────────────────────────────────
  try {
    const { data: order } = await supabase
      .from('orders')
      .select(`
        customer_id,
        scheduled_at,
        location_city,
        total_price,
        service_item_id,
        services(title, price, price_unit, payment_model, deposit_amount, quote_fee, city),
        service_items(name, price, price_unit, payment_model, deposit_amount, quote_fee, fee_mode, no_show_fee),
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
        const it = order.service_items ?? null
        const pr = order.profiles ?? {}
        // Model, cena, jednotka i název: z úkonu (má-li ho objednávka), jinak z karty.
        const isModelB = (it?.payment_model ?? sv.payment_model) === 'B'
        const title = it?.name || sv.title || 'Služba'
        const priceVal = order.total_price ?? it?.price ?? sv.price
        const unit = it?.price_unit ?? sv.price_unit

        const providerDisplayName = pr.display_name || pr.company_name || pr.full_name || 'Živnostník'
        const providerLegalName = pr.company_name || pr.full_name || null

        // Záloha (Model A) i poplatek za nacenění (Model B) se berou z ÚKONU;
        // karta zůstává jen jako záloha pro objednávky z doby před ceníkem.
        const depositAmount = isModelB
          ? (it?.quote_fee ?? sv.quote_fee)
          : (it?.deposit_amount ?? sv.deposit_amount)
        const depositLabel = fmtMoney(depositAmount)

        const { subject, html } = orderStatusEmail({
          clientName: (clientProfile as any)?.full_name ?? 'Zákazník',
          serviceTitle: title,
          providerName: providerDisplayName,
          status,
          orderUrl: `${APP_URL}/dashboard/objednavky/${orderId}`,

          providerLegalName,
          providerIco: pr.ico ?? null,
          providerPhone: pr.phone ?? null,

          priceText: fmtPrice(priceVal, unit, isModelB),
          depositText: depositLabel ? `${depositLabel}${isModelB ? ' (za nacenění)' : ' (započítá se do ceny)'}` : undefined,
          scheduledAt: fmtDate(order.scheduled_at),
          city: order.location_city ?? sv.city ?? undefined,
          // U modelu B se storno neřeší — platí se za nacenění, ne za termín.
          cancellationText: isModelB
            ? undefined
            : stornoText(it?.fee_mode, it?.no_show_fee, depositAmount),
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
// Adresa se ukládá i se souřadnicemi (lat/lng), pokud ji zákazník vybral z našeptávače
// Mapy.cz — živnostník pak vidí špendlík, kam má dojet. Když zákazník adresu jen napsal
// ručně (bez výběru ze seznamu), souřadnice přijdou null a uloží se jen text.
export async function setOrderAddress(
  orderId: string,
  address: string,
  coords?: { lat: number | null; lng: number | null }
): Promise<ActionResult> {
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
    .update({
      location_address: trimmed,
      location_lat: coords?.lat ?? null,
      location_lng: coords?.lng ?? null,
    })
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