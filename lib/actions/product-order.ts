'use server'
// lib/actions/product-order.ts
// Objednávka VÝROBKU (service_items.item_type = 'product').
//
// Proti oversellingu se nepoužívá žádné počítadlo `reserved_quantity` — to by se
// dřív nebo později rozešlo s realitou. Dostupnost se počítá vždy ze SKUTEČNÝCH
// objednávek, stejným vzorem, jaký už používá rezervace termínu (reserve-time.ts):
//
//   1) ověř dostupnost
//   2) vlož objednávku
//   3) ZNOVU sečti živé objednávky včetně té své
//   4) když je přes limit, svoji objednávku smaž a vrať chybu
//
// Krok 3 je to podstatné: když dva lidé projdou krokem 1 ve stejnou chvíli,
// oba se v kroku 3 uvidí navzájem a ten pozdější (podle created_at) couvne.
//
// ŽIVÁ OBJEDNÁVKA = drží zboží:
//   - není zrušená
//   - a buď je zaplacená / bez potřeby platby,
//   - nebo čeká na platbu a její hold ještě nevypršel (hold_expires_at v budoucnu)
// Propadlý hold tedy zboží automaticky uvolní, bez cronu a bez úklidu.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createNotification } from './notifications'
import { vyzadujePotvrzeni, confirmationDeadline, nejdrivejsiDenDodani } from '@/lib/product-confirmation'

// Kolik času má zákazník na dokončení platby. Stejný princip jako u termínů.
const HOLD_MINUTES = 30

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

type Result =
  | { success: true; id: string; needsPayment: boolean; awaitingConfirmation: boolean }
  | { success: false; error: string }

type ItemRow = {
  id: string
  service_id: string
  name: string
  is_active: boolean
  item_type: string | null
  price: number | null
  price_unit: string | null
  deposit_type: string | null
  deposit_amount: number | null
  stock_mode: string | null
  stock_quantity: number | null
  max_quantity_per_order: number | null
  production_capacity: number | null
  lead_time_days: number | null
  available_days: number[] | null
  min_quantity_per_order: number | null
  pickup_mode: string | null
  pickup_timing: string | null
}

// Drží tahle objednávka zboží?
//
// Tři situace, ne dvě (dřív se rozlišovalo jen „pending vs. zbytek", takže
// objednávka s deposit_status 'none' držela kusy navždy):
//   1) zaplaceno                    → drží, dokud ji někdo nezruší
//   2) potvrzená bez platby předem  → drží (bez_platby: platí se až na místě)
//   3) cokoli s běžícím holdem      → drží jen dokud hold trvá
//      (čeká na platbu NEBO čeká na potvrzení poskytovatele)
function zabiraZbozi(
  o: { status: string; deposit_status: string | null; hold_expires_at: string | null },
  now: number,
): boolean {
  if (o.deposit_status === 'paid' || o.deposit_status === 'released') return true
  if (o.status === 'prijato' && (o.deposit_status === 'none' || o.deposit_status == null)) {
    // Přijatá objednávka, u které se předem neplatí — drží zboží natrvalo.
    // Hold u ní nemá smysl, protože není na co čekat.
    return !o.hold_expires_at || new Date(o.hold_expires_at).getTime() > now
  }
  return o.hold_expires_at ? new Date(o.hold_expires_at).getTime() > now : false
}

// Počet kusů, které právě drží živé objednávky. Volitelně jen pro jeden den.
async function zabranoKusu(
  admin: any,
  itemId: string,
  den?: string | null,
  krome?: string | null,
): Promise<number> {
  let q = admin
    .from('orders')
    .select('id, quantity, status, deposit_status, hold_expires_at')
    .eq('service_item_id', itemId)
    .neq('status', 'zruseno')
  if (den) q = q.eq('needed_at', den)

  const { data } = await q as {
    data: Array<{
      id: string; quantity: number | null; status: string
      deposit_status: string | null; hold_expires_at: string | null
    }> | null
  }

  const now = Date.now()
  return (data ?? [])
    .filter((o) => o.id !== krome)
    .filter((o) => zabiraZbozi(o, now))
    .reduce((soucet, o) => soucet + (Number(o.quantity) || 1), 0)
}

// Kontrola dne dodání u výroby na objednávku: formát, předstih, povolený den.
function zkontrolujDen(item: ItemRow, den: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(den)) return 'Vyberte prosím den dodání.'
  const cil = new Date(`${den}T00:00:00`)
  if (isNaN(cil.getTime())) return 'Vyberte prosím platný den dodání.'

  const predstih = Number(item.lead_time_days ?? 0)
  // Nejbližší den bere v úvahu i to, že provider musí stihnout objednávku
  // potvrdit PŘED začátkem svého předstihu. Objednávka podaná pozdě večer se
  // proto posune o den — jinak by vznikla s už propadlou lhůtou.
  const nejdrivIso = nejdrivejsiDenDodani(predstih, new Date(), vyzadujePotvrzeni(item))
  if (den < nejdrivIso) {
    return predstih > 0
      ? `Tento výrobek je potřeba objednat aspoň ${predstih} ${predstih === 1 ? 'den' : predstih < 5 ? 'dny' : 'dní'} dopředu. Nejbližší možný den je ${nejdrivIso}.`
      : 'Tento den už objednat nelze.'
  }

  const dny = item.available_days
  if (dny && dny.length) {
    // JS: neděle = 0. My používáme 1=Po … 7=Ne.
    const denVTydnu = cil.getDay() === 0 ? 7 : cil.getDay()
    if (!dny.includes(denVTydnu)) return 'V tento den poskytovatel nevydává. Vyberte prosím jiný.'
  }
  return null
}

export async function orderProduct(values: {
  service_id: string
  service_item_id: string
  quantity: number
  /** Den dodání/vyzvednutí ve formátu YYYY-MM-DD — jen u výroby na objednávku. */
  needed_at?: string | null
  message?: string
  location_city?: string
  service_location?: string
}): Promise<Result> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Pro objednávku se musíte přihlásit.' }

  const admin = getAdminClient()
  const mnozstvi = Math.floor(Number(values.quantity))
  if (!mnozstvi || mnozstvi < 1) return { success: false, error: 'Zadejte počet kusů.' }

  // ── Položka ────────────────────────────────────────────────
  const { data: item } = await admin
    .from('service_items')
    .select('id, service_id, name, is_active, item_type, price, price_unit, deposit_type, deposit_amount, stock_mode, stock_quantity, max_quantity_per_order, min_quantity_per_order, production_capacity, lead_time_days, available_days, pickup_mode, pickup_timing')
    .eq('id', values.service_item_id)
    .single() as { data: ItemRow | null }

  if (!item || item.service_id !== values.service_id) {
    return { success: false, error: 'Vybraná položka nepatří k této kartě.' }
  }
  if (item.is_active !== true) return { success: false, error: 'Tento výrobek už není k objednání.' }
  if (item.item_type !== 'product') {
    return { success: false, error: 'Tato položka není výrobek.' }
  }

  // ── Karta a poskytovatel ───────────────────────────────────
  const { data: card } = await admin
    .from('services')
    .select('id, provider_id, is_active, city')
    .eq('id', values.service_id)
    .single() as { data: { id: string; provider_id: string; is_active: boolean; city: string | null } | null }

  if (!card || card.is_active !== true) return { success: false, error: 'Karta není dostupná.' }
  if (card.provider_id === user.id) {
    return { success: false, error: 'Vlastní výrobek si objednat nemůžete.' }
  }
  const { data: providerProfile } = await admin
    .from('profiles').select('is_suspended').eq('id', card.provider_id).single() as { data: { is_suspended: boolean | null } | null }
  if (providerProfile?.is_suspended === true) {
    return { success: false, error: 'Tento poskytovatel není momentálně dostupný.' }
  }

  const rezim = item.stock_mode ?? 'stock'
  const den = rezim === 'made_to_order' ? (values.needed_at ?? null) : null

  // ── Limit na jednu objednávku ──────────────────────────────
  const maxNaObjednavku = item.max_quantity_per_order
  if (maxNaObjednavku != null && mnozstvi > maxNaObjednavku) {
    return { success: false, error: `Najednou lze objednat nejvýš ${maxNaObjednavku} ks.` }
  }
  const minNaObjednavku = item.min_quantity_per_order
  if (minNaObjednavku != null && minNaObjednavku > 1 && mnozstvi < minNaObjednavku) {
    return { success: false, error: `Nejmenší možná objednávka je ${minNaObjednavku} ks.` }
  }

  // ── Předběžná kontrola dostupnosti ─────────────────────────
  if (rezim === 'stock') {
    const skladem = Number(item.stock_quantity ?? 0)
    if (skladem <= 0) return { success: false, error: 'Výrobek je vyprodaný.' }
    const zabrano = await zabranoKusu(admin, item.id)
    const volne = skladem - zabrano
    if (volne < mnozstvi) {
      return {
        success: false,
        error: volne > 0
          ? `K dispozici ${volne} ${volne === 1 ? 'kus' : volne < 5 ? 'kusy' : 'kusů'}. Upravte prosím počet.`
          : 'Výrobek je právě vyprodaný.',
      }
    }
  } else if (rezim === 'made_to_order') {
    if (!den) return { success: false, error: 'Vyberte den, kdy výrobek potřebujete.' }
    const chyba = zkontrolujDen(item, den)
    if (chyba) return { success: false, error: chyba }

    // KAPACITA JE MĚKKÁ, ne skladový limit.
    // Sklad je fyzický (víc kusů prostě není), ale denní kapacita je jen
    // „kolik obvykle zvládnu". Cukrář může kvůli dobré objednávce zůstat déle
    // v kuchyni — proto zákazníka neblokujeme a rozhodnutí necháme na
    // providerovi, který objednávku stejně potvrzuje (a vidí u ní upozornění).
    const kapacita = Number(item.production_capacity ?? 0)
    if (kapacita <= 0) return { success: false, error: 'Poskytovatel nemá nastavenou kapacitu výroby.' }
  }

  // ── Cena a platba ──────────────────────────────────────────
  // Platební režim je stejný jako u služeb (deposit_type). Záloha se u výrobku
  // násobí počtem kusů — je to záloha na celou objednávku, ne na jeden kus.
  const cenaZaKus = Number(item.price ?? 0)
  const celkem = cenaZaKus > 0 ? cenaZaKus * mnozstvi : null
  const platebniRezim = item.deposit_type ?? 'plna_platba'

  let castkaPredem = 0
  if (platebniRezim === 'plna_platba') {
    castkaPredem = celkem ?? 0
  } else if (platebniRezim === 'zaloha') {
    castkaPredem = Number(item.deposit_amount ?? 0) * mnozstvi
    if (celkem != null && castkaPredem > celkem) castkaPredem = celkem
  }
  const needsPayment = castkaPredem > 0

  // ── Založení objednávky ────────────────────────────────────
  // DVĚ CESTY podle toho, jestli se provider musí vyjádřit (viz product-confirmation):
  //
  //  a) POTVRZUJE PROVIDER (dort na zakázku, doručení, odběr po domluvě)
  //     → status 'cekajici', zákazník zatím NEPLATÍ. Zboží/kapacita se ale
  //       drží po dobu confirmation_deadline, jinak by ho mezitím koupil někdo
  //       jiný. Platba se odemkne až přijetím.
  //
  //  b) AUTOMATICKY (skladem + odběr v otevírací době)
  //     → status 'prijato' a rovnou platba, jak to fungovalo dosud.
  const potvrzuje = vyzadujePotvrzeni(item)
  const deadline = potvrzuje
    ? confirmationDeadline(den, item.lead_time_days)
    : null

  const { data: order, error: orderErr } = await (admin.from('orders') as any)
    .insert({
      customer_id: user.id,
      provider_id: card.provider_id,
      service_id: values.service_id,
      service_item_id: item.id,
      status: potvrzuje ? 'cekajici' : 'prijato',
      is_inquiry: false,
      description: values.message?.trim() || null,
      quantity: mnozstvi,
      unit_price: cenaZaKus > 0 ? cenaZaKus : null,
      total_price: celkem,
      needed_at: den,
      // Dokud provider nepotvrdí, nemá smysl počítat zálohu ani platbu.
      deposit_amount: potvrzuje ? null : (needsPayment ? castkaPredem : null),
      deposit_status: potvrzuje ? 'none' : (needsPayment ? 'pending' : 'none'),
      // hold_expires_at drží zboží v obou fázích — během čekání na potvrzení
      // až do deadline, po přijetí pak po dobu platebního okna.
      hold_expires_at: potvrzuje
        ? deadline!.toISOString()
        : (needsPayment ? new Date(Date.now() + HOLD_MINUTES * 60_000).toISOString() : null),
      confirmation_deadline: potvrzuje ? deadline!.toISOString() : null,
      location_city: values.location_city?.trim() || card.city || null,
      service_location: values.service_location ?? null,
    })
    .select('id')
    .single() as { data: { id: string } | null; error: any }

  if (orderErr || !order) {
    console.error('[orderProduct]', orderErr)
    return { success: false, error: 'Objednávku se nepodařilo vytvořit.' }
  }

  // ── Kontrola souběhu ───────────────────────────────────────
  // Teď už je naše objednávka v databázi, takže ji uvidí i ten druhý. Sečteme
  // znovu VŠECHNO včetně sebe: když jsme přes limit, couvá ten, kdo přišel později.
  // Souběh řešíme jen u SKLADU — tam je limit fyzický a přeprodat ho nelze.
  // U výroby na objednávku je kapacita měkká, takže se nic nevrací zpět;
  // překročení jen uvidí provider při potvrzování.
  const limit = rezim === 'stock' ? Number(item.stock_quantity ?? 0) : null

  if (limit != null) {
    const celkemZabrano = await zabranoKusu(admin, item.id, den)
    if (celkemZabrano > limit) {
      // Jsme přes. Kdo byl dřív, ten platí — porovnáme se staršími objednávkami.
      const { data: starsi } = await admin
        .from('orders')
        .select('id, quantity, created_at, deposit_status, hold_expires_at, status, needed_at')
        .eq('service_item_id', item.id)
        .neq('status', 'zruseno')
        .neq('id', order.id)
        .order('created_at', { ascending: true }) as { data: any[] | null }

      const now = Date.now()
      const zive = (starsi ?? []).filter((o: any) => {
        if (den && o.needed_at !== den) return false
        return zabiraZbozi(o, now)
      })
      const predNami = zive.reduce((s: number, o: any) => s + (Number(o.quantity) || 1), 0)

      if (predNami + mnozstvi > limit) {
        await admin.from('orders').delete().eq('id', order.id)
        return {
          success: false,
          error: rezim === 'stock'
            ? 'Někdo byl rychlejší — poslední kusy jsou právě zabrané. Zkuste menší počet.'
            : 'Kapacita na tento den se právě zaplnila. Vyberte prosím jiný den.',
        }
      }
    }
  }

  // ── Oznámení poskytovateli ─────────────────────────────────
  // Čeká-li se na jeho potvrzení, musí se dozvědět HNED — běží mu lhůta.
  // U rovnou přijaté a placené objednávky čekáme na zaplacení (řeší webhook),
  // ať mu nechodí zprávy o objednávkách, které nikdo nedoplatí.
  if (potvrzuje || !needsPayment) {
    try {
      await createNotification({
        userId: card.provider_id,
        type: 'status_change',
        orderId: order.id,
        actorId: user.id,
        title: potvrzuje ? 'Nová objednávka — potvrďte ji' : 'Nová objednávka výrobku',
        preview: potvrzuje
          ? `${mnozstvi}× ${item.name}${den ? ` · potřeba do ${den}` : ''}`
          : `${mnozstvi}× ${item.name}`,
      })
    } catch (err) {
      console.error('[orderProduct] notifikace:', err)
    }
  }

  revalidatePath(`/sluzby/${values.service_id}`)
  revalidatePath('/dashboard/objednavky')
  return {
    success: true,
    id: order.id,
    needsPayment: potvrzuje ? false : needsPayment,
    awaitingConfirmation: potvrzuje,
  }
}

// ── Dostupnost pro zobrazení v UI ────────────────────────────
// Kolik kusů je teď reálně volných (sklad), případně kapacita pro konkrétní den.
export async function getProductAvailability(
  itemId: string,
  den?: string | null,
): Promise<{ available: number | null; mode: string }> {
  const admin = getAdminClient()
  const { data: item } = await admin
    .from('service_items')
    .select('stock_mode, stock_quantity, production_capacity')
    .eq('id', itemId)
    .single() as { data: { stock_mode: string | null; stock_quantity: number | null; production_capacity: number | null } | null }

  if (!item) return { available: 0, mode: 'stock' }
  const rezim = item.stock_mode ?? 'stock'
  if (rezim === 'unlimited') return { available: null, mode: rezim }

  const limit = rezim === 'stock'
    ? Number(item.stock_quantity ?? 0)
    : Number(item.production_capacity ?? 0)
  const zabrano = await zabranoKusu(admin, itemId, rezim === 'made_to_order' ? (den ?? null) : null)
  return { available: Math.max(0, limit - zabrano), mode: rezim }
}

// Aktualizace skladu poskytovatelem (prodává i mimo Propojo).
export async function setStockQuantity(itemId: string, quantity: number): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nejste přihlášeni.' }

  const mnozstvi = Math.max(0, Math.floor(Number(quantity) || 0))
  const admin = getAdminClient()

  // Vlastnictví přes kartu položky.
  const { data: item } = await admin
    .from('service_items').select('id, service_id').eq('id', itemId).single() as { data: { id: string; service_id: string } | null }
  if (!item) return { success: false, error: 'Položka nebyla nalezena.' }
  const { data: card } = await admin
    .from('services').select('provider_id').eq('id', item.service_id).single() as { data: { provider_id: string } | null }
  if (!card || card.provider_id !== user.id) {
    return { success: false, error: 'Tato položka vám nepatří.' }
  }

  const { error } = await (admin.from('service_items') as any)
    .update({ stock_quantity: mnozstvi })
    .eq('id', itemId)
  if (error) {
    console.error('[setStockQuantity]', error)
    return { success: false, error: 'Sklad se nepodařilo uložit.' }
  }

  revalidatePath('/dashboard/nabidky')
  revalidatePath(`/sluzby/${item.service_id}`)
  return { success: true }
}

// ── POTVRZENÍ / ODMÍTNUTÍ POSKYTOVATELEM ─────────────────────
// Objednávka výrobku, u které se čeká na vyjádření (viz vyzadujePotvrzeni).
// Přijetím se odemkne platba, odmítnutím se uvolní držené zboží.

/** Provider přijímá objednávku — teprve teď se zákazníkovi zpřístupní platba. */
export async function acceptProductOrder(orderId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nejste přihlášeni.' }

  const admin = getAdminClient()
  const { data: order } = await admin
    .from('orders')
    .select('id, provider_id, customer_id, status, quantity, needed_at, service_items(name, deposit_type, deposit_amount, price, item_type)')
    .eq('id', orderId)
    .single() as { data: any }

  if (!order) return { success: false, error: 'Objednávka nenalezena.' }
  if (order.provider_id !== user.id) return { success: false, error: 'Tato objednávka vám nepatří.' }
  if (order.service_items?.item_type !== 'product') return { success: false, error: 'Tohle není objednávka výrobku.' }
  if (order.status !== 'cekajici') return { success: false, error: 'Tuhle objednávku už nelze potvrdit.' }

  // Kolik má zákazník zaplatit předem. Stejný výpočet jako při zakládání —
  // záloha se u výrobku počítá za kus.
  const polozka = order.service_items
  const pocet = Math.max(1, Number(order.quantity ?? 1))
  const cenaZaKus = Number(polozka?.price ?? 0)
  const celkem = cenaZaKus > 0 ? cenaZaKus * pocet : null
  const rezim = polozka?.deposit_type ?? 'plna_platba'
  let castkaPredem = 0
  if (rezim === 'plna_platba') {
    castkaPredem = celkem ?? 0
  } else if (rezim === 'zaloha') {
    castkaPredem = Number(polozka?.deposit_amount ?? 0) * pocet
    if (celkem != null && castkaPredem > celkem) castkaPredem = celkem
  }
  const needsPayment = castkaPredem > 0

  const { error } = await (admin.from('orders') as any)
    .update({
      status: 'prijato',
      confirmation_deadline: null,
      deposit_amount: needsPayment ? castkaPredem : null,
      deposit_status: needsPayment ? 'pending' : 'none',
      // Od přijetí běží platební okno. Bez platby předem se zboží drží natrvalo.
      hold_expires_at: needsPayment
        ? new Date(Date.now() + HOLD_MINUTES * 60_000).toISOString()
        : null,
    })
    .eq('id', orderId)
    .eq('status', 'cekajici')

  if (error) {
    console.error('[acceptProductOrder]', error)
    return { success: false, error: 'Objednávku se nepodařilo potvrdit.' }
  }

  try {
    await createNotification({
      userId: order.customer_id,
      type: 'status_change',
      orderId,
      actorId: user.id,
      title: needsPayment ? 'Objednávka potvrzena — můžete zaplatit' : 'Objednávka potvrzena',
      preview: pocet + 'x ' + (polozka?.name ?? 'výrobek'),
    })
  } catch (err) {
    console.error('[acceptProductOrder] notifikace:', err)
  }

  revalidatePath('/dashboard/objednavky')
  revalidatePath('/dashboard/objednavky/' + orderId)
  return { success: true }
}

/** Provider objednávku odmítá — držené zboží se uvolní, zákazník nic neplatil. */
export async function declineProductOrder(orderId: string, duvod?: string): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nejste přihlášeni.' }

  const admin = getAdminClient()
  const { data: order } = await admin
    .from('orders')
    .select('id, provider_id, customer_id, status, quantity, service_items(name, item_type)')
    .eq('id', orderId)
    .single() as { data: any }

  if (!order) return { success: false, error: 'Objednávka nenalezena.' }
  if (order.provider_id !== user.id) return { success: false, error: 'Tato objednávka vám nepatří.' }
  if (order.status !== 'cekajici') return { success: false, error: 'Tuhle objednávku už nelze odmítnout.' }

  const { error } = await (admin.from('orders') as any)
    .update({
      status: 'zruseno',
      cancelled_by: 'provider',
      confirmation_deadline: null,
      hold_expires_at: null,
    })
    .eq('id', orderId)
    .eq('status', 'cekajici')

  if (error) {
    console.error('[declineProductOrder]', error)
    return { success: false, error: 'Objednávku se nepodařilo odmítnout.' }
  }

  // Důvod jako zpráva v chatu, ať zákazník ví, na čem je.
  if (duvod && duvod.trim()) {
    try {
      await (admin.from('messages') as any).insert({
        order_id: orderId,
        sender_id: user.id,
        content: duvod.trim(),
      })
    } catch { /* zpráva není kritická */ }
  }

  try {
    await createNotification({
      userId: order.customer_id,
      type: 'status_change',
      orderId,
      actorId: user.id,
      title: 'Objednávku nešlo přijmout',
      preview: (order.service_items?.name ?? 'Výrobek') + ' · nic jsme vám neúčtovali.',
    })
  } catch (err) {
    console.error('[declineProductOrder] notifikace:', err)
  }

  revalidatePath('/dashboard/objednavky')
  revalidatePath('/dashboard/objednavky/' + orderId)
  return { success: true }
}

// ── CRON: vypršelá lhůta na potvrzení ────────────────────────
// Provider se do lhůty nevyjádřil → objednávka se ruší a držené zboží se uvolní.
// Bez tohohle by objednávka visela věčně a blokovala sklad.
export async function autoDeclineExpiredConfirmations(): Promise<{ cancelled: number }> {
  const admin = getAdminClient()
  const { data: rows } = await admin
    .from('orders')
    .select('id, customer_id, provider_id, service_items(name)')
    .eq('status', 'cekajici')
    .not('confirmation_deadline', 'is', null)
    .lt('confirmation_deadline', new Date().toISOString()) as { data: any[] | null }

  let cancelled = 0
  for (const o of rows ?? []) {
    const { error } = await (admin.from('orders') as any)
      .update({
        status: 'zruseno',
        cancelled_by: 'system',
        confirmation_deadline: null,
        hold_expires_at: null,
      })
      .eq('id', o.id)
      .eq('status', 'cekajici')
    if (error) {
      console.error('[autoDeclineExpiredConfirmations]', o.id, error)
      continue
    }
    cancelled++

    const nazev = o.service_items?.name ?? 'Výrobek'
    try {
      await createNotification({
        userId: o.customer_id,
        type: 'status_change',
        orderId: o.id,
        actorId: o.customer_id,
        title: 'Poskytovatel nestihl odpovědět',
        preview: nazev + ' · nic jsme vám neúčtovali, zkuste prosím jiného poskytovatele.',
      })
      await createNotification({
        userId: o.provider_id,
        type: 'status_change',
        orderId: o.id,
        actorId: o.provider_id,
        title: 'Objednávce vypršela lhůta',
        preview: nazev + ' · nepotvrdili jste ji včas, zboží jsme uvolnili.',
      })
    } catch { /* notifikace nejsou kritické */ }
  }

  return { cancelled }
}

/**
 * Vytížení dne u výroby na objednávku — podklad pro upozornění providerovi.
 *
 * Kapacita je MĚKKÁ: nebrání objednat ani potvrdit, jen říká, jak je den plný.
 * `over` = objednávek je víc, než kolik provider běžně zvládne.
 */
export async function getDayLoad(
  itemId: string,
  den: string,
): Promise<{ used: number; capacity: number; over: boolean } | null> {
  const admin = getAdminClient()
  const { data: item } = await admin
    .from('service_items')
    .select('stock_mode, production_capacity')
    .eq('id', itemId)
    .single() as { data: { stock_mode: string | null; production_capacity: number | null } | null }

  if (!item || item.stock_mode !== 'made_to_order') return null
  const capacity = Number(item.production_capacity ?? 0)
  if (capacity <= 0) return null

  const used = await zabranoKusu(admin, itemId, den)
  return { used, capacity, over: used > capacity }
}

// ── FYZICKÝ STAV VÝROBKU ─────────────────────────────────────
// Oddělené od orders.status schválně (viz vyrobky-vrstva6.sql). Tady se řeší,
// kde výrobek fyzicky je; obchodní stav a výplaty řídí dál orders.status.

type FulfillResult = { success: boolean; error?: string }

async function nactiProProvidera(orderId: string, userId: string) {
  const admin = getAdminClient()
  const { data: order } = await admin
    .from('orders')
    .select('id, provider_id, customer_id, status, quantity, deposit_status, service_location, product_fulfillment_status, service_items(name, item_type)')
    .eq('id', orderId)
    .single() as { data: any }
  if (!order) return { admin, order: null, error: 'Objednávka nenalezena.' }
  if (order.provider_id !== userId) return { admin, order: null, error: 'Tato objednávka vám nepatří.' }
  if (order.service_items?.item_type !== 'product') return { admin, order: null, error: 'Tohle není objednávka výrobku.' }
  return { admin, order, error: null as string | null }
}

/**
 * Provider označí, že je výrobek hotový a čeká na zákazníka.
 *
 * POZOR: tohle NESPOUŠTÍ výplatu. orders.status zůstává 'prijato', takže se
 * objednávka nedostane do 'ceka_potvrzeni' ani do dvoudenního automatu.
 * Peníze se uvolní až po skutečném předání.
 */
export async function markProductReady(orderId: string, photoUrl?: string | null): Promise<FulfillResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nejste přihlášeni.' }

  const { admin, order, error: loadErr } = await nactiProProvidera(orderId, user.id)
  if (loadErr || !order) return { success: false, error: loadErr ?? 'Objednávka nenalezena.' }
  if (order.status !== 'prijato') return { success: false, error: 'Objednávku lze označit jako připravenou až po přijetí a zaplacení.' }

  const { error } = await (admin.from('orders') as any)
    .update({
      product_fulfillment_status: 'ready',
      product_ready_at: new Date().toISOString(),
      // Fotka hotové objednávky — nepovinná, ale u zakázkové výroby to je
      // moment, kdy Propojo působí líp než obyčejná zpráva v chatu.
      ready_photo_url: photoUrl?.trim() || null,
    })
    .eq('id', orderId)
    .eq('status', 'prijato')

  if (error) {
    console.error('[markProductReady]', error)
    return { success: false, error: 'Nepodařilo se uložit.' }
  }

  const doruceni = order.service_location === 'u_zakaznika'
  try {
    await createNotification({
      userId: order.customer_id,
      type: 'status_change',
      orderId,
      actorId: user.id,
      title: doruceni ? 'Objednávka je připravená k doručení' : 'Objednávka je připravená k vyzvednutí',
      preview: (order.quantity > 1 ? order.quantity + 'x ' : '') + (order.service_items?.name ?? 'výrobek')
        + (photoUrl?.trim() ? ' · přidána fotka' : ''),
    })
  } catch (err) {
    console.error('[markProductReady] notifikace:', err)
  }

  revalidatePath('/dashboard/objednavky')
  revalidatePath('/dashboard/objednavky/' + orderId)
  return { success: true }
}

/**
 * Provider označí, že výrobek předal / doručil.
 *
 * TEPRVE TADY přechází objednávka do 'ceka_potvrzeni' — od toho okamžiku běží
 * dvoudenní automat na uvolnění peněz (payout.autoReleaseStaleDeposits počítá
 * od completed_at). Zákazník má mezitím možnost potvrdit nebo nahlásit problém.
 */
export async function markProductHandedOver(orderId: string): Promise<FulfillResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nejste přihlášeni.' }

  const { admin, order, error: loadErr } = await nactiProProvidera(orderId, user.id)
  if (loadErr || !order) return { success: false, error: loadErr ?? 'Objednávka nenalezena.' }
  if (order.status !== 'prijato') return { success: false, error: 'Tuhle objednávku už nelze označit jako předanou.' }

  // Bez zaplacení není co uvolňovat — stejná ochrana jako u služeb.
  const zaplaceno = order.deposit_status === 'paid' || order.deposit_status === 'released'
  const bezPlatbyPredem = order.deposit_status === 'none' || order.deposit_status == null
  if (!zaplaceno && !bezPlatbyPredem) {
    return { success: false, error: 'Objednávka ještě není zaplacená.' }
  }

  const ted = new Date().toISOString()
  const { error } = await (admin.from('orders') as any)
    .update({
      product_fulfillment_status: 'handed_over',
      product_handed_over_at: ted,
      // Od téhle chvíle běží lhůta na potvrzení zákazníkem.
      status: 'ceka_potvrzeni',
      completed_at: ted,
    })
    .eq('id', orderId)
    .eq('status', 'prijato')

  if (error) {
    console.error('[markProductHandedOver]', error)
    return { success: false, error: 'Nepodařilo se uložit.' }
  }

  const doruceni = order.service_location === 'u_zakaznika'
  try {
    await createNotification({
      userId: order.customer_id,
      type: 'status_change',
      orderId,
      actorId: user.id,
      title: doruceni ? 'Objednávka byla doručena' : 'Objednávka byla předána',
      preview: 'Potvrďte prosím, že je vše v pořádku.',
    })
  } catch (err) {
    console.error('[markProductHandedOver] notifikace:', err)
  }

  revalidatePath('/dashboard/objednavky')
  revalidatePath('/dashboard/objednavky/' + orderId)
  return { success: true }
}