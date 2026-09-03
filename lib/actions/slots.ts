'use server'
// lib/actions/slots.ts — kalendář: správa volných oken poskytovatele a rezervace.
// Okno = od-do + seznam služeb, které se do něj vejdou (slot_services).
//
// VÝBĚR ČASU: zákazník si vybere konkrétní začátek uvnitř okna (mřížka po 15
// minutách, počítá ji modal). Okno 10:00–16:00 s půlhodinovým úkonem a volbou
// 14:00 se rozpadne na:
//     10:00–14:00  volno   (původní záznam, jen zkrácený)
//     14:00–14:30  zabráno (nový záznam, na něj se váže objednávka)
//     14:30–16:00  volno   (nový záznam, přebírá služby původního okna)
// Zbytky kratší než 15 minut nevznikají — přilepí se k rezervaci.
//
// PLATBA DRŽÍ TERMÍN: u úkonu se zálohou vytvoří rezervace rovnou i platbu
// a vrátí na ni odkaz (payUrl). Odkaz platí 30 minut (deposit.ts) — když
// zákazník nezaplatí, Stripe pošle 'checkout.session.expired', webhook
// objednávku zruší a termín vrátí mezi volné.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createDepositCheckout } from '@/lib/actions/deposit'
import { rozsahCasu, cas, denVTydnuPraha, minutyOdPulnociPraha, casNaMinuty } from '@/lib/format'

type Result = { success: true; id?: string; payUrl?: string } | { success: false; error: string }

// Supabase klient se service role — typy generované pro DB neznají všechny
// naše tabulky, proto volně.
type AdminLike = any

// Záložní minimum pro zbytek okna. Skutečná hranice se počítá z nejkratšího
// úkonu, který se v daném okně nabízí (viz reserveSlotForItem) — tohle se
// použije, jen když u žádného úkonu není vyplněná délka.
const MIN_REMAINDER_MIN = 15

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Založí platbu k čerstvé rezervaci. Když se nepovede (poskytovatel nemá
// dokončený Stripe, výpadek…), rezervace platí dál — zákazník zaplatí
// z detailu objednávky. Proto se chyba jen loguje.
async function zaridPlatbu(orderId: string): Promise<string | undefined> {
  try {
    const pay = await createDepositCheckout(orderId)
    if (pay.success) return pay.url
    console.warn('[slots] platbu se nepodařilo založit:', pay.error)
  } catch (err) {
    console.error('[slots] zaridPlatbu:', err)
  }
  return undefined
}

const minutesBetween = (a: string, b: string) =>
  Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000)

const plusMinutes = (iso: string, min: number) =>
  new Date(new Date(iso).getTime() + min * 60000).toISOString()


// ── Otevírací doba ────────────────────────────────────────────
// Okno musí padnout do doby, kterou má poskytovatel u karty vypsanou.
// Kdo hodiny nevyplnil, není ničím omezený — příznak „nemám otevírací dobu"
// znamená, že si čas hlídá sám.
async function mimoOteviraciDobu(
  admin: AdminLike,
  serviceIds: string[],
  startIso: string,
  endIso: string
): Promise<string | null> {
  if (serviceIds.length === 0) return null

  const den = denVTydnuPraha(startIso)
  const od = minutyOdPulnociPraha(startIso)
  const doKdy = minutyOdPulnociPraha(endIso)

  // Okno přes půlnoc otevírací dobou neposuzujeme — do dne se nevejde.
  if (doKdy <= od) return null

  const { data: hodiny } = await admin
    .from('service_hours')
    .select('service_id, weekday, starts_at, ends_at')
    .in('service_id', serviceIds) as { data: { service_id: string; weekday: number; starts_at: string; ends_at: string }[] | null }

  const vsechny = hodiny ?? []
  if (vsechny.length === 0) return null

  for (const sid of serviceIds) {
    const proKartu = vsechny.filter((h) => h.service_id === sid)
    if (proKartu.length === 0) continue          // tahle karta hodiny nemá

    const vDen = proKartu.filter((h) => h.weekday === den)
    if (vDen.length === 0) {
      const { data: karta } = await admin
        .from('services').select('title').eq('id', sid).single() as { data: { title: string } | null }
      return `V tenhle den máte u nabídky „${karta?.title ?? 'vybraná karta'}" zavřeno. Změňte otevírací dobu, nebo vyberte jiný den.`
    }

    const vejdeSe = vDen.some(
      (h) => od >= casNaMinuty(h.starts_at) && doKdy <= casNaMinuty(h.ends_at)
    )
    if (!vejdeSe) {
      const rozsahy = vDen
        .map((h) => `${h.starts_at.slice(0, 5)}–${h.ends_at.slice(0, 5)}`)
        .join(', ')
      const { data: karta } = await admin
        .from('services').select('title').eq('id', sid).single() as { data: { title: string } | null }
      return `Okno je mimo otevírací dobu nabídky „${karta?.title ?? 'vybraná karta'}" (ten den máte ${rozsahy}).`
    }
  }

  return null
}

// ── Blokace ───────────────────────────────────────────────────
// Dovolená, doktor, zákazník z ulice. Blokace bez service_id platí na všechny
// karty. Do zablokovaného času nesmí vzniknout okno ani rezervace — jinak by
// poskytovateli přišel zákazník ve chvíli, kdy si sám zavřel.
async function kryjeSeSBlokaci(
  admin: AdminLike,
  providerId: string,
  serviceIds: string[],
  startIso: string,
  endIso: string
): Promise<string | null> {
  const { data: bloky } = await admin
    .from('provider_blocks')
    .select('starts_at, ends_at, reason, service_id')
    .eq('provider_id', providerId)
    .lt('starts_at', endIso)
    .gt('ends_at', startIso) as { data: { starts_at: string; ends_at: string; reason: string | null; service_id: string | null }[] | null }

  const platne = (bloky ?? []).filter(
    (b) => b.service_id == null || serviceIds.includes(b.service_id)
  )
  if (platne.length === 0) return null

  const b = platne[0]
  const kdy = `${cas(b.starts_at)}–${cas(b.ends_at)}`
  return b.reason
    ? `V tomhle čase máte blokaci ${kdy} (${b.reason}).`
    : `V tomhle čase máte blokaci ${kdy}.`
}

// ── Přidat volné okno ─────────────────────────────────────────
export async function createSlot(values: {
  starts_at: string
  ends_at: string
  service_ids: string[]
}): Promise<Result> {
  const supabase = createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, error: 'Nejste přihlášeni.' }

  const starts = new Date(values.starts_at)
  const ends = new Date(values.ends_at)
  if (isNaN(starts.getTime()) || isNaN(ends.getTime())) {
    return { success: false, error: 'Neplatný čas.' }
  }
  if (ends <= starts) return { success: false, error: 'Konec okna musí být po začátku.' }
  if (starts < new Date()) return { success: false, error: 'Okno nemůže začínat v minulosti.' }

  const ids = Array.from(new Set((values.service_ids ?? []).filter(Boolean)))
  if (ids.length === 0) {
    return { success: false, error: 'Vyberte alespoň jednu službu, která se do okna vejde.' }
  }

  const admin = getAdminClient()

  // Vybrané služby musí patřit poskytovateli
  const { data: myServices } = await admin
    .from('services').select('id').eq('provider_id', user.id).in('id', ids)
  if (!myServices || myServices.length !== ids.length) {
    return { success: false, error: 'Některá vybraná služba nepatří k vašemu účtu.' }
  }

  // Nesmí se překrývat s jiným mým oknem — ani s tím, které čeká na rozhodnutí.
  const { data: overlap } = await admin
    .from('availability_slots')
    .select('id, starts_at, ends_at, status, pending_confirm')
    .eq('provider_id', user.id)
    .lt('starts_at', ends.toISOString())
    .gt('ends_at', starts.toISOString())
    .limit(1)
  if (overlap && overlap.length > 0) {
    const o = overlap[0] as any
    // Přes lib/format.ts — server běží v UTC a bez pevné zóny by hláška
    // ukazovala čas o dvě hodiny dřív, než jaké okno doopravdy překáží.
    const rozsah = rozsahCasu(o.starts_at, o.ends_at)
    if (o.pending_confirm === true) {
      return {
        success: false,
        error: `Čas ${rozsah} vám zbyl po rezervaci a čeká na rozhodnutí — najdete ho nahoře u dotazu „Vleze se k vám ještě někdo?".`,
      }
    }
    if (o.status === 'zabrano') {
      return { success: false, error: `V čase ${rozsah} už máte rezervaci.` }
    }
    return { success: false, error: `V čase ${rozsah} už máte volné okno.` }
  }

  // Otevírací doba a blokace — poskytovatel nesmí vypsat čas, který si sám zavřel.
  // Dřív to appka pustila a zákazník si mohl rezervovat termín na dovolenou.
  const chybaDoby = await mimoOteviraciDobu(admin, ids, starts.toISOString(), ends.toISOString())
  if (chybaDoby) return { success: false, error: chybaDoby }

  const chybaBloku = await kryjeSeSBlokaci(admin, user.id, ids, starts.toISOString(), ends.toISOString())
  if (chybaBloku) return { success: false, error: `${chybaBloku} Nejdřív ji zrušte v Termínech.` }

  // Vytvoř okno
  const { data: slot, error } = await (admin.from('availability_slots') as any)
    .insert({ provider_id: user.id, starts_at: starts.toISOString(), ends_at: ends.toISOString() })
    .select('id')
    .single()
  if (error || !slot) {
    console.error('[createSlot]', error)
    return { success: false, error: 'Okno se nepodařilo uložit.' }
  }

  // Přiřaď služby
  const rows = ids.map((sid) => ({ slot_id: slot.id, service_id: sid }))
  const { error: linkErr } = await (admin.from('slot_services') as any).insert(rows)
  if (linkErr) {
    console.error('[createSlot slot_services]', linkErr)
    await admin.from('availability_slots').delete().eq('id', slot.id)
    return { success: false, error: 'Nepodařilo se přiřadit služby k oknu.' }
  }

  revalidatePath('/dashboard/terminy')
  return { success: true, id: slot.id }
}

// ── Smazat volné okno (jen když je ještě volné) ───────────────
export async function deleteSlot(slotId: string): Promise<Result> {
  const supabase = createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, error: 'Nejste přihlášeni.' }

  const admin = getAdminClient()

  const { data: slot } = await admin
    .from('availability_slots')
    .select('id, provider_id, status')
    .eq('id', slotId)
    .single() as { data: { id: string; provider_id: string; status: string } | null }

  if (!slot) return { success: false, error: 'Okno nenalezeno.' }
  if (slot.provider_id !== user.id) return { success: false, error: 'Toto okno nepatří k vašemu účtu.' }
  if (slot.status !== 'volno') {
    return { success: false, error: 'Okno už je rezervované – nelze smazat. Řešte přes objednávku.' }
  }

  await admin.from('slot_services').delete().eq('slot_id', slotId)
  const { error } = await admin.from('availability_slots').delete().eq('id', slotId)
  if (error) {
    console.error('[deleteSlot]', error)
    return { success: false, error: 'Okno se nepodařilo smazat.' }
  }

  revalidatePath('/dashboard/terminy')
  return { success: true, id: slotId }
}

// ── Rezervace okna zákazníkem (bez ceníku — starý tok) ────────
export async function reserveSlot(values: {
  slot_id: string
  service_id: string
  message?: string
  location_city?: string
  service_location?: string
}): Promise<Result> {
  const supabase = createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, error: 'Nejste přihlášeni.' }

  const admin = getAdminClient()

  const { data: slot } = await admin
    .from('availability_slots')
    .select('id, provider_id, starts_at, ends_at, status')
    .eq('id', values.slot_id)
    .single() as { data: { id: string; provider_id: string; starts_at: string; ends_at: string; status: string } | null }

  if (!slot) return { success: false, error: 'Termín nenalezen.' }
  if (slot.status !== 'volno') return { success: false, error: 'Tento termín byl právě zabrán. Vyberte prosím jiný.' }
  if (new Date(slot.starts_at) < new Date()) return { success: false, error: 'Tento termín už proběhl.' }
  if (slot.provider_id === user.id) return { success: false, error: 'Vlastní termín si rezervovat nemůžete.' }

  const { data: link } = await admin
    .from('slot_services')
    .select('service_id')
    .eq('slot_id', slot.id)
    .eq('service_id', values.service_id)
    .single()
  if (!link) return { success: false, error: 'Tato služba se do vybraného termínu nenabízí.' }

  const { data: service } = await admin
    .from('services')
    .select('id, provider_id, deposit_amount')
    .eq('id', values.service_id)
    .single() as { data: { id: string; provider_id: string; deposit_amount: number | null } | null }
  if (!service || service.provider_id !== slot.provider_id) {
    return { success: false, error: 'Služba nepatří k tomuto poskytovateli.' }
  }

  const { data: order, error: orderErr } = await (admin.from('orders') as any)
    .insert({
      customer_id: user.id,
      provider_id: slot.provider_id,
      service_id: values.service_id,
      status: 'prijato',
      description: values.message?.trim() || null,
      deposit_amount: service.deposit_amount ?? null,
      deposit_status: 'none',
      location_city: values.location_city?.trim() || null,
      service_location: values.service_location ?? null,
      scheduled_at: slot.starts_at,
      slot_id: slot.id,
    })
    .select('id')
    .single()
  if (orderErr || !order) {
    console.error('[reserveSlot order]', orderErr)
    return { success: false, error: 'Rezervaci se nepodařilo vytvořit.' }
  }

  const { data: taken, error: takeErr } = await (admin.from('availability_slots') as any)
    .update({ status: 'zabrano', order_id: order.id })
    .eq('id', slot.id)
    .eq('status', 'volno')
    .select('id')
  if (takeErr || !taken || taken.length === 0) {
    await admin.from('orders').delete().eq('id', order.id)
    return { success: false, error: 'Tento termín byl právě zabrán. Vyberte prosím jiný.' }
  }

  try {
    await (admin.from('notifications') as any).insert({
      user_id: slot.provider_id,
      type: 'status_change',
      order_id: order.id,
      actor_id: user.id,
      title: 'Nová rezervace termínu (potvrzeno)',
      preview: null,
    })
  } catch {}

  revalidatePath('/dashboard/objednavky')
  revalidatePath('/dashboard/terminy')
  return { success: true, id: order.id }
}

// ── Rezervace KONKRÉTNÍHO ČASU pro úkon z ceníku ──────────────
// values.starts_at = začátek, který si zákazník vybral v mřížce. Když chybí,
// bere se začátek okna (starý tok, sdílené odkazy).
export async function reserveSlotForItem(values: {
  slot_id: string
  service_id: string
  service_item_id: string
  starts_at?: string
  message?: string
  location_city?: string
  service_location?: string
  /** Nákup na firmu — snapshot údajů odběratele k objednávce. */
  billing?: {
    is_company: boolean
    name?: string | null
    ico?: string | null
    dic?: string | null
    address?: string | null
  }
}): Promise<Result> {
  const supabase = createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, error: 'Nejste přihlášeni.' }

  const admin = getAdminClient()

  const { data: slot } = await admin
    .from('availability_slots')
    .select('id, provider_id, starts_at, ends_at, status')
    .eq('id', values.slot_id)
    .single() as { data: { id: string; provider_id: string; starts_at: string; ends_at: string; status: string } | null }

  if (!slot) return { success: false, error: 'Termín nenalezen.' }
  if (slot.status !== 'volno') return { success: false, error: 'Tento termín byl právě zabrán. Vyberte prosím jiný.' }
  if (new Date(slot.starts_at) < new Date()) return { success: false, error: 'Tento termín už proběhl.' }
  if (slot.provider_id === user.id) return { success: false, error: 'Vlastní termín si rezervovat nemůžete.' }

  const { data: link } = await admin
    .from('slot_services')
    .select('service_id')
    .eq('slot_id', slot.id)
    .eq('service_id', values.service_id)
    .single()
  if (!link) return { success: false, error: 'Tato služba se do vybraného termínu nenabízí.' }

  const { data: item } = await admin
    .from('service_items')
    .select('id, service_id, name, duration_minutes, deposit_amount, deposit_type, price, payment_model, is_active')
    .eq('id', values.service_item_id)
    .single() as { data: { id: string; service_id: string; name: string; duration_minutes: number | null; deposit_amount: number | null; deposit_type: string | null; price: number | null; payment_model: string; is_active: boolean } | null }

  if (!item || item.service_id !== values.service_id) {
    return { success: false, error: 'Vybraný úkon nepatří k této kartě.' }
  }
  if (!item.is_active) {
    return { success: false, error: 'Tento úkon už není k objednání.' }
  }

  const loadedStart = slot.starts_at
  const loadedEnd = slot.ends_at
  const windowMin = minutesBetween(loadedStart, loadedEnd)

  if (item.duration_minutes && item.duration_minutes > windowMin) {
    return {
      success: false,
      error: `Tento úkon trvá ${item.duration_minutes} min, ale vybraný termín má jen ${windowMin} min. Vyberte delší termín.`,
    }
  }

  // ── Vybraný začátek ──────────────────────────────────────────
  // Kontrola se dělá znovu na serveru — v prohlížeči se dá obejít.
  let bookedStart = loadedStart
  if (values.starts_at) {
    const chosen = new Date(values.starts_at)
    if (isNaN(chosen.getTime())) return { success: false, error: 'Neplatný čas.' }
    if (chosen < new Date()) return { success: false, error: 'Tento čas už proběhl.' }
    const offset = minutesBetween(loadedStart, values.starts_at)
    if (offset < 0) return { success: false, error: 'Vybraný čas je mimo nabízené okno.' }
    const potreba = item.duration_minutes ?? windowMin
    if (offset + potreba > windowMin) {
      return { success: false, error: 'Do vybraného času se úkon už nevejde. Vyberte prosím jiný.' }
    }
    bookedStart = new Date(chosen).toISOString()
  }

  // Čas, na který se zákazník objednal. Zůstává, i když se kolem něj zablokuje
  // nepoužitelný zbytek okna — na kartě má stát 14:15, ne 14:00.
  const zacatekUkonu = bookedStart
  const durMin = item.duration_minutes ?? minutesBetween(bookedStart, loadedEnd)
  let bookedEnd = plusMinutes(bookedStart, durMin)
  // Skutečný konec služby si držíme zvlášť. bookedEnd se níž může roztáhnout o
  // nepoužitelný zbytek fyzického okna, ale kolize objednávek se řeší podle služby.
  const serviceEnd = bookedEnd

  // Které služby okno nabízelo — potřebujeme je na dvě věci: dopočítat
  // nejkratší možný zbytek a předat je zbytku za rezervací.
  const { data: puvodniLinky } = await admin
    .from('slot_services')
    .select('service_id')
    .eq('slot_id', slot.id) as { data: { service_id: string }[] | null }
  const nabizeneKarty = Array.from(new Set((puvodniLinky ?? []).map((l) => l.service_id)))

  // ── Nejkratší použitelný zbytek ──────────────────────────────
  // Zbytek okna má cenu jen tehdy, když se do něj vejde aspoň ten nejkratší
  // úkon, který se v okně nabízí. Barber s nejkratší službou 45 min nemá co
  // dělat s patnáctiminutovým okénkem — jen by mu leželo v kalendáři a nikdo
  // by si ho neobjednal. Kratší zbytek proto zablokujeme spolu s rezervací.
  const { data: nabizeneUkony } = nabizeneKarty.length > 0
    ? await admin
        .from('service_items')
        .select('duration_minutes')
        .in('service_id', nabizeneKarty)
        .eq('is_active', true)
        .eq('payment_model', 'A') as { data: { duration_minutes: number | null }[] | null }
    : { data: [] as { duration_minutes: number | null }[] }

  const delky = (nabizeneUkony ?? [])
    .map((u) => u.duration_minutes)
    .filter((d): d is number => typeof d === 'number' && d > 0)
  const minZbytek = delky.length > 0 ? Math.min(...delky) : MIN_REMAINDER_MIN

  // Nepoužitelné okraje se přilepí k rezervaci. Blokuje se tím čas, který
  // poskytovatel stejně neprodá — a zbytek, který zůstane, jde objednat.
  let headMin = minutesBetween(loadedStart, bookedStart)
  if (headMin > 0 && headMin < minZbytek) {
    bookedStart = loadedStart
    headMin = 0
  }
  let tailMin = minutesBetween(bookedEnd, loadedEnd)
  if (tailMin > 0 && tailMin < minZbytek) {
    bookedEnd = loadedEnd
    tailMin = 0
  }

  // ── Dosah poskytovatele ──────────────────────────────────────
  if (values.location_city) {
    const { data: card } = await admin
      .from('services')
      .select('city_lat, city_lng, radius_km, location_type')
      .eq('id', values.service_id)
      .single() as { data: { city_lat: number | null; city_lng: number | null; radius_km: number | null; location_type: string | null } | null }

    if (
      card?.location_type !== 'u_poskytovatele' &&
      card?.radius_km && card.city_lat != null && card.city_lng != null
    ) {
      const { data: obec } = await admin
        .from('obce')
        .select('latitude, longitude')
        .ilike('obec', values.location_city.trim())
        .limit(1)
        .maybeSingle() as { data: { latitude: number; longitude: number } | null }

      if (obec) {
        const R = 6371
        const dLat = ((obec.latitude - card.city_lat) * Math.PI) / 180
        const dLng = ((obec.longitude - card.city_lng) * Math.PI) / 180
        const x =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos((card.city_lat * Math.PI) / 180) * Math.cos((obec.latitude * Math.PI) / 180) *
          Math.sin(dLng / 2) * Math.sin(dLng / 2)
        const dist = R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))

        if (dist > card.radius_km) {
          return {
            success: false,
            error: `Tato obec je mimo dosah poskytovatele (jezdí do ${card.radius_km} km, vaše obec je asi ${Math.round(dist)} km daleko).`,
          }
        }
      }
    }
  }

  // Blokace mohla vzniknout až po vypsání okna (dovolená, doktor). Rezervaci
  // do zablokovaného času nepustíme — poskytovatel by o ní nevěděl.
  const chybaBloku = await kryjeSeSBlokaci(admin, slot.provider_id, [values.service_id], bookedStart, bookedEnd)
  if (chybaBloku) {
    return { success: false, error: 'Tenhle čas už poskytovatel nemá volný. Vyberte prosím jiný.' }
  }

  // Pojistka proti dvojí rezervaci mezi dvěma kalendářovými vrstvami.
  // Termín domluvený přes návrhy nemusí mít availability_slot, ale blokuje čas přes
  // orders.scheduled_at. Starší fyzické okno může přesto zůstat „volno", proto před
  // jeho zabráním kontrolujeme i existující objednávky poskytovatele.
  const { data: orderClashes } = await admin
    .from('orders')
    .select('id, scheduled_at, scheduled_end, deposit_status, hold_expires_at, service_items(duration_minutes)')
    .eq('provider_id', slot.provider_id)
    .neq('status', 'zruseno')
    .not('scheduled_at', 'is', null)
    .lt('scheduled_at', serviceEnd) as { data: any[] | null }

  const liveClash = (orderClashes ?? []).some((o) => {
    if (o.deposit_status === 'pending' && o.hold_expires_at) {
      if (new Date(o.hold_expires_at).getTime() <= Date.now()) return false
    }
    const startMs = new Date(o.scheduled_at).getTime()
    const fallbackDur = Number(o.service_items?.duration_minutes ?? 60) || 60
    const endMs = o.scheduled_end
      ? new Date(o.scheduled_end).getTime()
      : startMs + fallbackDur * 60_000
    return new Date(zacatekUkonu).getTime() < endMs && new Date(serviceEnd).getTime() > startMs
  })

  if (liveClash) {
    return { success: false, error: 'Tento čas mezitím obsadila jiná objednávka. Vyberte prosím jiný termín.' }
  }

  const depositType = item.deposit_type ?? 'zaloha'
  const isFullPayment = item.payment_model !== 'B' && depositType === 'plna_platba'
  const depositForOrder = item.payment_model === 'B'
    ? null
    : depositType === 'bez_platby'
      ? null
      : isFullPayment
        ? (item.price != null && Number(item.price) > 0 ? Number(item.price) : null)
        : (item.deposit_amount != null && Number(item.deposit_amount) > 0 ? Number(item.deposit_amount) : null)
  const platiSeHned = !!depositForOrder && depositForOrder > 0

  // ── ZABRÁNÍ TERMÍNU ──────────────────────────────────────────
  // Souběh dvou zákazníků hlídá podmínka na původním okně: musí být pořád
  // 'volno' a mít nezměněné hranice. Kdo je změní první, vyhrál.
  const guard = (q: any) =>
    q.eq('id', slot.id).eq('status', 'volno').eq('starts_at', loadedStart).eq('ends_at', loadedEnd)

  let bookedSlotId: string | null = null
  let obsazenoCele = false

  if (headMin === 0 && tailMin === 0) {
    // Celé okno padne na rezervaci → použijeme rovnou původní záznam.
    const { data: taken } = await guard(
      (admin.from('availability_slots') as any).update({ status: 'zabrano' })
    ).select('id')
    if (!taken || taken.length === 0) {
      return { success: false, error: 'Tento termín byl právě zabrán. Vyberte prosím jiný.' }
    }
    bookedSlotId = slot.id
    obsazenoCele = true
  } else if (headMin === 0) {
    // Rezervace na začátku → původní okno se posune za ni.
    const { data: shrunk } = await guard(
      (admin.from('availability_slots') as any).update({ starts_at: bookedEnd, pending_confirm: false })
    ).select('id')
    if (!shrunk || shrunk.length === 0) {
      return { success: false, error: 'Tento termín byl právě zabrán. Vyberte prosím jiný.' }
    }
  } else {
    // Rezervace uprostřed nebo na konci → původní okno se zkrátí na část PŘED ní.
    const { data: shrunk } = await guard(
      (admin.from('availability_slots') as any).update({ ends_at: bookedStart, pending_confirm: false })
    ).select('id')
    if (!shrunk || shrunk.length === 0) {
      return { success: false, error: 'Tento termín byl právě zabrán. Vyberte prosím jiný.' }
    }
  }

  // Úklid, když něco spadne po zabrání termínu — vrátíme okno, jak bylo.
  const vratOknoZpet = async () => {
    if (obsazenoCele) {
      await (admin.from('availability_slots') as any)
        .update({ status: 'volno', order_id: null })
        .eq('id', slot.id)
    } else {
      await (admin.from('availability_slots') as any)
        .update({ starts_at: loadedStart, ends_at: loadedEnd })
        .eq('id', slot.id)
    }
  }

  // Vlastní záznam pro zabraný úsek (když nezabral celé okno)
  if (!bookedSlotId) {
    const { data: seg, error: segErr } = await (admin.from('availability_slots') as any)
      .insert({
        provider_id: slot.provider_id,
        starts_at: bookedStart,
        ends_at: bookedEnd,
        status: 'zabrano',
      })
      .select('id')
      .single()
    if (segErr || !seg) {
      console.error('[reserveSlotForItem seg]', segErr)
      await vratOknoZpet()
      return { success: false, error: 'Rezervaci se nepodařilo vytvořit.' }
    }
    bookedSlotId = seg.id
    await (admin.from('slot_services') as any)
      .insert({ slot_id: seg.id, service_id: values.service_id })
  }

  // Objednávka
  const { data: order, error: orderErr } = await (admin.from('orders') as any)
    .insert({
      customer_id: user.id,
      provider_id: slot.provider_id,
      service_id: values.service_id,
      service_item_id: values.service_item_id,
      // Poskytovatel souhlasil tím, že termín i úkon nabídl → rovnou 'prijato'.
      status: 'prijato',
      description: values.message?.trim() || null,
      deposit_amount: depositForOrder,
      // Když má úkon zálohu, objednávka čeká na úhradu — jinak by šlo zahájit
      // práci bez zaplacení (kontrola v updateOrderStatus testuje 'pending').
      deposit_status: platiSeHned ? 'pending' : 'none',
      location_city: values.location_city?.trim() || null,
      service_location: values.service_location ?? null,
      billing_is_company: values.billing?.is_company === true,
      billing_name: values.billing?.name?.trim() || null,
      billing_ico: values.billing?.ico?.trim() || null,
      billing_dic: values.billing?.dic?.trim() || null,
      billing_address: values.billing?.address?.trim() || null,
      scheduled_at: zacatekUkonu,
      scheduled_end: serviceEnd,
      slot_id: bookedSlotId,
    })
    .select('id')
    .single()
  if (orderErr || !order) {
    console.error('[reserveSlotForItem order]', orderErr)
    if (!obsazenoCele && bookedSlotId) {
      await admin.from('slot_services').delete().eq('slot_id', bookedSlotId)
      await admin.from('availability_slots').delete().eq('id', bookedSlotId)
    }
    await vratOknoZpet()
    return { success: false, error: 'Rezervaci se nepodařilo vytvořit.' }
  }

  await (admin.from('availability_slots') as any)
    .update({ order_id: order.id })
    .eq('id', bookedSlotId)

  // Zbytek ZA rezervací — nový volný záznam, dědí služby původního okna.
  // Nabízí se rovnou; okno jste vypsal celé, takže platí celé.
  if (headMin > 0 && tailMin > 0) {
    const { data: tail } = await (admin.from('availability_slots') as any)
      .insert({
        provider_id: slot.provider_id,
        starts_at: bookedEnd,
        ends_at: loadedEnd,
        status: 'volno',
        pending_confirm: false,
      })
      .select('id')
      .single()
    if (tail) {
      const linky = nabizeneKarty.map((sid) => ({ slot_id: tail.id, service_id: sid }))
      if (linky.length > 0) {
        await (admin.from('slot_services') as any).insert(linky)
      }
    }
  }

  // Notifikace poskytovateli
  try {
    const cas = new Intl.DateTimeFormat('cs-CZ', {
      day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit',
    }).format(new Date(zacatekUkonu))
    await (admin.from('notifications') as any).insert({
      user_id: slot.provider_id,
      type: 'status_change',
      order_id: order.id,
      actor_id: user.id,
      title: platiSeHned ? 'Nová rezervace — čeká na zaplacení' : 'Nová rezervace ✓',
      preview: `${item.name} · ${cas}`,
    })
  } catch {}

  const payUrl = platiSeHned ? await zaridPlatbu(order.id) : undefined

  revalidatePath('/dashboard/objednavky')
  revalidatePath('/dashboard/terminy')
  return { success: true, id: order.id, payUrl }
}

// ── Rozhodnutí o zbytku okna po rezervaci ────────────────────────
// Zůstává kvůli oknům, která na rozhodnutí čekají z dřívějška.

/** Nabídnout zbytek okna dál — od téhle chvíle si ho může někdo rezervovat. */
export async function confirmRemainder(slotId: string): Promise<Result> {
  const supabase = createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, error: 'Nejste přihlášeni.' }

  const admin = getAdminClient()

  const { data: slot } = await admin
    .from('availability_slots')
    .select('id, provider_id, status, starts_at')
    .eq('id', slotId)
    .single() as { data: { id: string; provider_id: string; status: string; starts_at: string } | null }

  if (!slot) return { success: false, error: 'Okno nenalezeno.' }
  if (slot.provider_id !== user.id) return { success: false, error: 'Toto okno nepatří k vašemu účtu.' }
  if (slot.status !== 'volno') return { success: false, error: 'Toto okno už není volné.' }
  if (new Date(slot.starts_at) < new Date()) {
    return { success: false, error: 'Tento čas už proběhl.' }
  }

  const { error } = await (admin.from('availability_slots') as any)
    .update({ pending_confirm: false })
    .eq('id', slotId)
    .eq('provider_id', user.id)

  if (error) {
    console.error('[confirmRemainder]', error)
    return { success: false, error: 'Nepodařilo se okno zveřejnit.' }
  }

  revalidatePath('/dashboard/terminy')
  return { success: true, id: slotId }
}

/** Zbytek okna nechci — smaže se, nikomu se nenabídne. */
export async function dismissRemainder(slotId: string): Promise<Result> {
  const supabase = createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, error: 'Nejste přihlášeni.' }

  const admin = getAdminClient()

  const { data: slot } = await admin
    .from('availability_slots')
    .select('id, provider_id, status')
    .eq('id', slotId)
    .single() as { data: { id: string; provider_id: string; status: string } | null }

  if (!slot) return { success: false, error: 'Okno nenalezeno.' }
  if (slot.provider_id !== user.id) return { success: false, error: 'Toto okno nepatří k vašemu účtu.' }
  if (slot.status !== 'volno') {
    return { success: false, error: 'Toto okno je rezervované — řešte přes objednávku.' }
  }

  // Vazby na karty odejdou s oknem (FK cascade to neřeší všude, tak explicitně).
  await admin.from('slot_services').delete().eq('slot_id', slotId)

  const { error } = await admin
    .from('availability_slots')
    .delete()
    .eq('id', slotId)
    .eq('provider_id', user.id)

  if (error) {
    console.error('[dismissRemainder]', error)
    return { success: false, error: 'Nepodařilo se okno zavřít.' }
  }

  revalidatePath('/dashboard/terminy')
  return { success: true, id: slotId }
}