'use server'
// lib/actions/slots.ts — kalendář Fáze 1: správa volných oken poskytovatele.
// Okno = od-do + seznam služeb, které se do něj vejdou (slot_services).
// Rezervace zákazníkem přijde v další části (reserveSlot).

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

type Result = { success: true; id?: string } | { success: false; error: string }

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
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
  // Rozlišujeme to v hlášce: čekající zbytek uživatel v seznamu oken nevidí
  // (je nahoře v dotazu „Vleze se k vám ještě někdo?"), takže by jinak nechápal,
  // co mu čas blokuje.
  const { data: overlap } = await admin
    .from('availability_slots')
    .select('id, starts_at, ends_at, status, pending_confirm')
    .eq('provider_id', user.id)
    .lt('starts_at', ends.toISOString())
    .gt('ends_at', starts.toISOString())
    .limit(1)
  if (overlap && overlap.length > 0) {
    const o = overlap[0] as any
    const fmt = (iso: string) =>
      new Date(iso).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })
    const rozsah = `${fmt(o.starts_at)}–${fmt(o.ends_at)}`
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

  const { error } = await admin.from('availability_slots').delete().eq('id', slotId)
  if (error) {
    console.error('[deleteSlot]', error)
    return { success: false, error: 'Okno se nepodařilo smazat.' }
  }

  revalidatePath('/dashboard/terminy')
  return { success: true, id: slotId }
}

// ── Rezervace okna zákazníkem (samoobsluha: klik = termín) ────
// Anti-double-booking: UPDATE projde jen když je slot stále 'volno'
// (podmínka .eq('status','volno') v UPDATE je atomická — druhý zájemce
// o zlomek vteřiny později dostane 0 řádků a chybu "právě zabráno").
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

  // Slot musí existovat, být volný a v budoucnu
  const { data: slot } = await admin
    .from('availability_slots')
    .select('id, provider_id, starts_at, ends_at, status')
    .eq('id', values.slot_id)
    .single() as { data: { id: string; provider_id: string; starts_at: string; ends_at: string; status: string } | null }

  if (!slot) return { success: false, error: 'Termín nenalezen.' }
  if (slot.status !== 'volno') return { success: false, error: 'Tento termín byl právě zabrán. Vyberte prosím jiný.' }
  if (new Date(slot.starts_at) < new Date()) return { success: false, error: 'Tento termín už proběhl.' }
  if (slot.provider_id === user.id) return { success: false, error: 'Vlastní termín si rezervovat nemůžete.' }

  // Služba musí patřit poskytovateli slotu a být v okně nabízená
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

  // 1) Vytvoř objednávku s termínem (stav cekajici — poskytovatel ji přijme jako obvykle)
  const { data: order, error: orderErr } = await (admin.from('orders') as any)
    .insert({
      customer_id: user.id,
      provider_id: slot.provider_id,
      service_id: values.service_id,
      // Poskytovatel už souhlasil tím, že termín nabídl → rovnou 'prijato',
      // žádné další potvrzování (samoobsluha, jak jsme se dohodli).
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

  // 2) ATOMICKY zaber slot (jen pokud je stále volno)
  const { data: taken, error: takeErr } = await (admin.from('availability_slots') as any)
    .update({ status: 'zabrano', order_id: order.id })
    .eq('id', slot.id)
    .eq('status', 'volno')
    .select('id')
  if (takeErr || !taken || taken.length === 0) {
    // Někdo byl rychlejší → smaž právě vytvořenou objednávku
    await admin.from('orders').delete().eq('id', order.id)
    return { success: false, error: 'Tento termín byl právě zabrán. Vyberte prosím jiný.' }
  }

  // 3) Notifikace poskytovateli
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

// ── Rezervace okna pro KONKRÉTNÍ ÚKON z ceníku (model karta + ceník) ──────────
// Jako reserveSlot výše, ale objednávka se váže na service_item_id: cena, název
// i záloha se pak berou z úkonu (service_items), ne z karty. Úkon se do okna
// vejde jen když jeho délka (duration_minutes) není delší než okno — krátké okno
// na dlouhý úkon odmítneme. Slot je široké okno, ne pevná délka, takže žádné
// dělení ani zbytky neřešíme (skládání úkonů do bloků je až v2).
export async function reserveSlotForItem(values: {
  slot_id: string
  service_id: string
  service_item_id: string
  message?: string
  location_city?: string
  service_location?: string
}): Promise<Result> {
  const supabase = createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, error: 'Nejste přihlášeni.' }

  const admin = getAdminClient()

  // Slot musí existovat, být volný a v budoucnu
  const { data: slot } = await admin
    .from('availability_slots')
    .select('id, provider_id, starts_at, ends_at, status')
    .eq('id', values.slot_id)
    .single() as { data: { id: string; provider_id: string; starts_at: string; ends_at: string; status: string } | null }

  if (!slot) return { success: false, error: 'Termín nenalezen.' }
  if (slot.status !== 'volno') return { success: false, error: 'Tento termín byl právě zabrán. Vyberte prosím jiný.' }
  if (new Date(slot.starts_at) < new Date()) return { success: false, error: 'Tento termín už proběhl.' }
  if (slot.provider_id === user.id) return { success: false, error: 'Vlastní termín si rezervovat nemůžete.' }

  // Služba musí patřit poskytovateli slotu a být v okně nabízená
  const { data: link } = await admin
    .from('slot_services')
    .select('service_id')
    .eq('slot_id', slot.id)
    .eq('service_id', values.service_id)
    .single()
  if (!link) return { success: false, error: 'Tato služba se do vybraného termínu nenabízí.' }

  // Úkon musí patřit k této kartě a být zveřejněný. Záloha se bere z ÚKONU.
  const { data: item } = await admin
    .from('service_items')
    .select('id, service_id, name, duration_minutes, deposit_amount, payment_model, is_active')
    .eq('id', values.service_item_id)
    .single() as { data: { id: string; service_id: string; name: string; duration_minutes: number | null; deposit_amount: number | null; payment_model: string; is_active: boolean } | null }

  if (!item || item.service_id !== values.service_id) {
    return { success: false, error: 'Vybraný úkon nepatří k této kartě.' }
  }
  if (!item.is_active) {
    return { success: false, error: 'Tento úkon už není k objednání.' }
  }

  // Kontrola délky: úkon se musí vejít do okna.
  const windowMinutes = Math.round(
    (new Date(slot.ends_at).getTime() - new Date(slot.starts_at).getTime()) / 60000
  )
  if (item.duration_minutes && item.duration_minutes > windowMinutes) {
    return {
      success: false,
      error: `Tento úkon trvá ${item.duration_minutes} min, ale vybraný termín má jen ${windowMinutes} min. Vyberte delší termín.`,
    }
  }

  // ── Dosah poskytovatele ──────────────────────────────────────────
  // Rezervace se přijímá automaticky, takže tady musí platforma zaručit,
  // že poskytovatel dostane jen termín, kam reálně dojede. Kontrola v prohlížeči
  // se dá obejít, proto se počítá znovu na serveru.
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

  // U modelu B (nacenění) zálohu nefixujeme — poplatek/nacenění řeší poskytovatel.
  const depositForOrder = item.payment_model === 'B' ? null : (item.deposit_amount ?? null)

  // ── Zkracování okna ──────────────────────────────────────────────
  // Když je úkon kratší než okno, zabere jen svůj čas OD ZAČÁTKU okna a zbytek
  // zůstane volný pro dalšího zákazníka. Zbytky pod 15 minut nenecháváme —
  // žádný úkon se do nich nevejde a v nabídce by jen mátly.
  //
  // Provedení: zabraný úsek dostane VLASTNÍ záznam (na něj se váže objednávka),
  // původní okno se zkrátí (posune se mu začátek) a zůstane 'volno'. Sdílený
  // odkaz /termin/[id] tak žije dál — ukazuje zkrácené okno, ne 404.
  //
  // Souběh dvou rezervací hlídá podmínka .eq('starts_at', loadedStart) na
  // závěrečném UPDATE: kdo změní okno první, vyhrál; druhému se update nechytne
  // a jeho rozpracovaná rezervace se uklidí.
  const loadedStart = slot.starts_at
  const MIN_REMAINDER_MIN = 15
  const durMin = item.duration_minutes ?? null
  const remainderMin = durMin ? windowMinutes - durMin : 0
  const shouldSplit = !!durMin && remainderMin >= MIN_REMAINDER_MIN
  const bookedEndIso = shouldSplit
    ? new Date(new Date(loadedStart).getTime() + (durMin as number) * 60000).toISOString()
    : slot.ends_at

  if (shouldSplit) {
    // 1) Záznam pro zabraný úsek
    const { data: seg, error: segErr } = await (admin.from('availability_slots') as any)
      .insert({
        provider_id: slot.provider_id,
        starts_at: loadedStart,
        ends_at: bookedEndIso,
        status: 'zabrano',
      })
      .select('id')
      .single()
    if (segErr || !seg) {
      console.error('[reserveSlotForItem seg]', segErr)
      return { success: false, error: 'Rezervaci se nepodařilo vytvořit.' }
    }

    // Vazba na kartu — ať je v přehledu termínů vidět, k čemu úsek patří.
    await (admin.from('slot_services') as any)
      .insert({ slot_id: seg.id, service_id: values.service_id })

    // 2) Objednávka navázaná na zabraný úsek
    const { data: order, error: orderErr } = await (admin.from('orders') as any)
      .insert({
        customer_id: user.id,
        provider_id: slot.provider_id,
        service_id: values.service_id,
        service_item_id: values.service_item_id,
        status: 'prijato',
        description: values.message?.trim() || null,
        deposit_amount: depositForOrder,
        // Když má úkon zálohu, objednávka rovnou čeká na úhradu — jinak by
        // šlo zahájit práci bez zaplacení (kontrola v updateOrderStatus
        // testuje právě 'pending').
        deposit_status: depositForOrder && depositForOrder > 0 ? 'pending' : 'none',
        location_city: values.location_city?.trim() || null,
        service_location: values.service_location ?? null,
        scheduled_at: loadedStart,
        slot_id: seg.id,
      })
      .select('id')
      .single()
    if (orderErr || !order) {
      console.error('[reserveSlotForItem order]', orderErr)
      await admin.from('slot_services').delete().eq('slot_id', seg.id)
      await admin.from('availability_slots').delete().eq('id', seg.id)
      return { success: false, error: 'Rezervaci se nepodařilo vytvořit.' }
    }

    await (admin.from('availability_slots') as any)
      .update({ order_id: order.id })
      .eq('id', seg.id)

    // 3) ATOMICKY zkrátit původní okno (jen pokud mezitím nikdo nerezervoval).
    //    Zbytek SE NENABÍZÍ, dokud ho poskytovatel nepotvrdí — rozhoduje sám,
    //    jestli k sobě chce hned dalšího člověka (pauza, úklid, únava).
    const { data: shrunk, error: shrinkErr } = await (admin.from('availability_slots') as any)
      .update({ starts_at: bookedEndIso, pending_confirm: true })
      .eq('id', slot.id)
      .eq('status', 'volno')
      .eq('starts_at', loadedStart)
      .select('id')
    if (shrinkErr || !shrunk || shrunk.length === 0) {
      // Souběh — někdo byl rychlejší. Uklidíme rozpracovanou rezervaci.
      await admin.from('orders').delete().eq('id', order.id)
      await admin.from('slot_services').delete().eq('slot_id', seg.id)
      await admin.from('availability_slots').delete().eq('id', seg.id)
      return { success: false, error: 'Tento termín byl právě zabrán. Vyberte prosím jiný.' }
    }

    // 4) Notifikace poskytovateli — rovnou s dotazem na zbytek okna
    try {
      await (admin.from('notifications') as any).insert({
        user_id: slot.provider_id,
        type: 'status_change',
        order_id: order.id,
        actor_id: user.id,
        title: `Nová rezervace — zbývá vám ${remainderMin} min, nabídnout dál?`,
        preview: item.name,
      })
    } catch {}

    revalidatePath('/dashboard/objednavky')
    revalidatePath('/dashboard/terminy')
    return { success: true, id: order.id }
  }

  // ── Úkon vyplní okno (skoro) celé → zabrat celé, jako dřív ──────
  // 1) Vytvoř objednávku s termínem (rovnou 'prijato' — samoobsluha, poskytovatel
  //    souhlasil tím, že termín i úkon nabídl)
  const { data: order, error: orderErr } = await (admin.from('orders') as any)
    .insert({
      customer_id: user.id,
      provider_id: slot.provider_id,
      service_id: values.service_id,
      service_item_id: values.service_item_id,
      status: 'prijato',
      description: values.message?.trim() || null,
      deposit_amount: depositForOrder,
      deposit_status: depositForOrder && depositForOrder > 0 ? 'pending' : 'none',
      location_city: values.location_city?.trim() || null,
      service_location: values.service_location ?? null,
      scheduled_at: loadedStart,
      slot_id: slot.id,
    })
    .select('id')
    .single()
  if (orderErr || !order) {
    console.error('[reserveSlotForItem order]', orderErr)
    return { success: false, error: 'Rezervaci se nepodařilo vytvořit.' }
  }

  // 2) ATOMICKY zaber slot (jen pokud je stále volno a nikdo ho mezitím nezkrátil)
  const { data: taken, error: takeErr } = await (admin.from('availability_slots') as any)
    .update({ status: 'zabrano', order_id: order.id })
    .eq('id', slot.id)
    .eq('status', 'volno')
    .eq('starts_at', loadedStart)
    .select('id')
  if (takeErr || !taken || taken.length === 0) {
    await admin.from('orders').delete().eq('id', order.id)
    return { success: false, error: 'Tento termín byl právě zabrán. Vyberte prosím jiný.' }
  }

  // 3) Notifikace poskytovateli (název úkonu v náhledu)
  try {
    await (admin.from('notifications') as any).insert({
      user_id: slot.provider_id,
      type: 'status_change',
      order_id: order.id,
      actor_id: user.id,
      title: 'Nová rezervace termínu (potvrzeno)',
      preview: item.name,
    })
  } catch {}

  revalidatePath('/dashboard/objednavky')
  revalidatePath('/dashboard/terminy')
  return { success: true, id: order.id }
}


// ── Rozhodnutí o zbytku okna po rezervaci ────────────────────────
// Když si zákazník vezme jen část okna, zbytek se schová a čeká, až poskytovatel
// řekne, jestli k sobě chce hned dalšího člověka. Do té doby ho nikdo nevidí.

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