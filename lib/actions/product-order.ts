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

// Kolik času má zákazník na dokončení platby. Stejný princip jako u termínů.
const HOLD_MINUTES = 30

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

type Result =
  | { success: true; id: string; needsPayment: boolean }
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
  min_quantity_per_order: number | null
  max_quantity_per_order: number | null
  production_capacity: number | null
  lead_time_days: number | null
  available_days: number[] | null
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
    .filter((o) => {
      // Čeká na platbu → drží zboží jen dokud běží hold.
      if (o.deposit_status === 'pending') {
        return o.hold_expires_at ? new Date(o.hold_expires_at).getTime() > now : false
      }
      return true
    })
    .reduce((soucet, o) => soucet + (Number(o.quantity) || 1), 0)
}

// Kontrola dne dodání u výroby na objednávku: formát, předstih, povolený den.
function zkontrolujDen(item: ItemRow, den: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(den)) return 'Vyberte prosím den dodání.'
  const cil = new Date(`${den}T00:00:00`)
  if (isNaN(cil.getTime())) return 'Vyberte prosím platný den dodání.'

  const dnes = new Date()
  dnes.setHours(0, 0, 0, 0)
  const predstih = Number(item.lead_time_days ?? 0)
  const nejdriv = new Date(dnes)
  nejdriv.setDate(nejdriv.getDate() + predstih)
  if (cil.getTime() < nejdriv.getTime()) {
    return predstih > 0
      ? `Tento výrobek je potřeba objednat aspoň ${predstih} ${predstih === 1 ? 'den' : predstih < 5 ? 'dny' : 'dní'} dopředu.`
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
    .select('id, service_id, name, is_active, item_type, price, price_unit, deposit_type, deposit_amount, stock_mode, stock_quantity, min_quantity_per_order, max_quantity_per_order, production_capacity, lead_time_days, available_days')
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

  // ── Limity na jednu objednávku ─────────────────────────────
  // Minimum musí hlídat i server — klientský stepper lze obejít.
  const minNaObjednavku = Math.max(1, Number(item.min_quantity_per_order ?? 1))
  if (mnozstvi < minNaObjednavku) {
    return {
      success: false,
      error: `Minimální množství v jedné objednávce je ${minNaObjednavku} ks.`,
    }
  }

  const maxNaObjednavku = item.max_quantity_per_order
  if (maxNaObjednavku != null && mnozstvi > maxNaObjednavku) {
    return { success: false, error: `Najednou lze objednat nejvýš ${maxNaObjednavku} ks.` }
  }

  // Pojistka proti nekonzistentnímu nastavení položky.
  if (maxNaObjednavku != null && maxNaObjednavku < minNaObjednavku) {
    return {
      success: false,
      error: 'Poskytovatel má u výrobku neplatně nastavené minimální a maximální množství.',
    }
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

    const kapacita = Number(item.production_capacity ?? 0)
    if (kapacita <= 0) return { success: false, error: 'Poskytovatel nemá nastavenou kapacitu výroby.' }
    const zabrano = await zabranoKusu(admin, item.id, den)
    const volne = kapacita - zabrano
    if (volne < mnozstvi) {
      return {
        success: false,
        error: volne > 0
          ? `Na tento den zbývá kapacita ${volne} ${volne === 1 ? 'kus' : volne < 5 ? 'kusy' : 'kusů'}. Vyberte jiný den nebo menší počet.`
          : 'Na tento den je už kapacita plná. Vyberte prosím jiný den.',
      }
    }
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
  // Status 'prijato': poskytovatel výrobek vypsal s dostupností, takže objednávku
  // neschvaluje zvlášť — stejná logika jako u rezervace vypsaného termínu.
  const { data: order, error: orderErr } = await (admin.from('orders') as any)
    .insert({
      customer_id: user.id,
      provider_id: card.provider_id,
      service_id: values.service_id,
      service_item_id: item.id,
      status: 'prijato',
      is_inquiry: false,
      description: values.message?.trim() || null,
      quantity: mnozstvi,
      unit_price: cenaZaKus > 0 ? cenaZaKus : null,
      total_price: celkem,
      needed_at: den,
      deposit_amount: needsPayment ? castkaPredem : null,
      deposit_status: needsPayment ? 'pending' : 'none',
      hold_expires_at: needsPayment
        ? new Date(Date.now() + HOLD_MINUTES * 60_000).toISOString()
        : null,
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
  const limit = rezim === 'stock'
    ? Number(item.stock_quantity ?? 0)
    : rezim === 'made_to_order'
      ? Number(item.production_capacity ?? 0)
      : null

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
        if (o.deposit_status === 'pending') {
          return o.hold_expires_at ? new Date(o.hold_expires_at).getTime() > now : false
        }
        return true
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
  // U placené objednávky čekáme na zaplacení (řeší webhook), ať poskytovateli
  // nechodí zprávy o objednávkách, které nikdo nedoplatí.
  if (!needsPayment) {
    try {
      await createNotification({
        userId: card.provider_id,
        type: 'status_change',
        orderId: order.id,
        actorId: user.id,
        title: 'Nová objednávka výrobku',
        preview: `${mnozstvi}× ${item.name}`,
      })
    } catch (err) {
      console.error('[orderProduct] notifikace:', err)
    }
  }

  revalidatePath(`/sluzby/${values.service_id}`)
  revalidatePath('/dashboard/objednavky')
  return { success: true, id: order.id, needsPayment }
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