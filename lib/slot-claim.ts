// lib/slot-claim.ts
// Připne už EXISTUJÍCÍ objednávku na odpovídající volný availability_slot.
// Používá se u termínu domluveného přes návrhy: pokud provider měl pro tento čas
// opravdu vypsané volné okno, rozřízneme ho stejně jako přímá rezervace, aby se
// potvrzený čas dál nezobrazoval jako volný. Když žádné takové okno neexistuje
// (provider navrhl čas ručně mimo kalendář), vrací null a objednávka blokuje čas
// pouze přes orders.scheduled_at.

type AdminClient = any

type ClaimArgs = {
  orderId: string
  providerId: string
  serviceId: string
  startsAt: string
  endsAt: string
}

type SlotRow = {
  id: string
  starts_at: string
  ends_at: string
  status: string
}

export async function claimMatchingAvailabilitySlot(
  admin: AdminClient,
  args: ClaimArgs
): Promise<string | null> {
  const startIso = new Date(args.startsAt).toISOString()
  const endIso = new Date(args.endsAt).toISOString()
  if (new Date(endIso) <= new Date(startIso)) return null

  // Najdeme volná okna poskytovatele, do kterých se celý potvrzený termín vejde.
  const { data: candidates } = await admin
    .from('availability_slots')
    .select('id, starts_at, ends_at, status')
    .eq('provider_id', args.providerId)
    .eq('status', 'volno')
    .lte('starts_at', startIso)
    .gte('ends_at', endIso)
    .order('starts_at', { ascending: true })
    .limit(10) as { data: SlotRow[] | null }

  let slot: SlotRow | null = null
  for (const candidate of candidates ?? []) {
    const { data: link } = await admin
      .from('slot_services')
      .select('slot_id')
      .eq('slot_id', candidate.id)
      .eq('service_id', args.serviceId)
      .maybeSingle() as { data: { slot_id: string } | null }
    if (link) { slot = candidate; break }
  }
  if (!slot) return null

  const originalStart = slot.starts_at
  const originalEnd = slot.ends_at
  const { data: links } = await admin
    .from('slot_services')
    .select('service_id, item_ids')
    .eq('slot_id', slot.id) as { data: { service_id: string; item_ids: string[] | null }[] | null }
  const serviceIds = Array.from(new Set((links ?? []).map((l) => l.service_id)))
  const itemsOf = new Map((links ?? []).map((l) => [l.service_id, l.item_ids ?? null]))

  const guard = (q: any) => q
    .eq('id', slot!.id)
    .eq('status', 'volno')
    .eq('starts_at', originalStart)
    .eq('ends_at', originalEnd)

  const atStart = new Date(startIso).getTime() === new Date(originalStart).getTime()
  const atEnd = new Date(endIso).getTime() === new Date(originalEnd).getTime()

  // Celé okno = jen ho označíme jako zabrané.
  if (atStart && atEnd) {
    const { data: taken } = await guard(
      admin.from('availability_slots').update({
        status: 'zabrano', order_id: args.orderId, pending_confirm: false,
      })
    ).select('id')
    return Array.isArray(taken) && taken.length > 0 ? taken[0].id : null
  }

  // Nejdřív atomicky zkrátíme původní volné okno. Tím vyhrajeme race s jinou rezervací.
  const shrinkPatch = atStart
    ? { starts_at: endIso, pending_confirm: false }
    : { ends_at: startIso, pending_confirm: false }

  const { data: shrunk } = await guard(
    admin.from('availability_slots').update(shrinkPatch)
  ).select('id')
  if (!Array.isArray(shrunk) || shrunk.length === 0) return null

  // Vlastní zabraný úsek.
  const { data: booked, error: bookedErr } = await admin
    .from('availability_slots')
    .insert({
      provider_id: args.providerId,
      starts_at: startIso,
      ends_at: endIso,
      status: 'zabrano',
      order_id: args.orderId,
      pending_confirm: false,
    })
    .select('id')
    .single()

  if (bookedErr || !booked) {
    await admin.from('availability_slots')
      .update({ starts_at: originalStart, ends_at: originalEnd, pending_confirm: false })
      .eq('id', slot.id)
    return null
  }

  if (serviceIds.length > 0) {
    await admin.from('slot_services').insert(
      serviceIds.map((serviceId) => ({ slot_id: booked.id, service_id: serviceId }))
    )
  }

  // Rezervace uprostřed: potřebujeme ještě volný zbytek ZA ní.
  if (!atStart && !atEnd) {
    const { data: tail, error: tailErr } = await admin
      .from('availability_slots')
      .insert({
        provider_id: args.providerId,
        starts_at: endIso,
        ends_at: originalEnd,
        status: 'volno',
        pending_confirm: false,
      })
      .select('id')
      .single()

    if (tailErr || !tail) {
      // Bez tailu bychom providerovi omylem sebrali kus původního okna. Vraťme změnu.
      await admin.from('slot_services').delete().eq('slot_id', booked.id)
      await admin.from('availability_slots').delete().eq('id', booked.id)
      await admin.from('availability_slots')
        .update({ starts_at: originalStart, ends_at: originalEnd, pending_confirm: false })
        .eq('id', slot.id)
      return null
    }

    if (serviceIds.length > 0) {
      await admin.from('slot_services').insert(
        serviceIds.map((serviceId) => ({ slot_id: tail.id, service_id: serviceId, item_ids: itemsOf.get(serviceId) ?? null }))
      )
    }
  }

  return booked.id as string
}

// ─── Potvrzená rezervace zkrátí překrývající se volná okna (19. 10. 2026) ─────────────
// claimMatchingAvailabilitySlot výše vyřízne jen okno, ve kterém rezervace leží CELÁ (a které nabízí její
// kartu). Rezervace z otevírací doby, výjezd nebo termín z chatu ale může okno přesahovat – to pak zůstalo
// „volné“, zákazníci ho viděli a rezervace jim spadla na kolizi (test 4. 10.: 11:16–13:16 vs. volno 11:15–12:00).
// Po potvrzení proto každé volné okno poskytovatele, které se s rezervací překrývá, zkrátíme (zbytek před /
// za rezervací zůstává nabídnutý, když má aspoň MIN_PIECE_MIN), nebo smažeme. Stejně jako blokace času
// (blockTime) bere celý kalendář poskytovatele – je to jeden člověk.

const MIN_PIECE_MIN = 15

export async function trimOverlappingFreeSlots(
  admin: AdminClient,
  args: { providerId: string; startsAt: string; endsAt: string }
): Promise<void> {
  const startMs = new Date(args.startsAt).getTime()
  const endMs = new Date(args.endsAt).getTime()
  if (!(endMs > startMs)) return
  const startIso = new Date(startMs).toISOString()
  const endIso = new Date(endMs).toISOString()

  const { data: overlapping } = await admin
    .from('availability_slots')
    .select('id, starts_at, ends_at, status')
    .eq('provider_id', args.providerId)
    .eq('status', 'volno')
    .lt('starts_at', endIso)
    .gt('ends_at', startIso) as { data: SlotRow[] | null }

  for (const slot of overlapping ?? []) {
    const sMs = new Date(slot.starts_at).getTime()
    const eMs = new Date(slot.ends_at).getTime()
    const keepBefore = startMs - sMs >= MIN_PIECE_MIN * 60_000
    const keepAfter = eMs - endMs >= MIN_PIECE_MIN * 60_000
    // Změna jen když okno je pořád volné a nezměněné (souběh s jinou rezervací)
    const guard = (q: any) => q.eq('id', slot.id).eq('status', 'volno').eq('starts_at', slot.starts_at).eq('ends_at', slot.ends_at)

    if (!keepBefore && !keepAfter) {
      const { data: gone } = await guard(admin.from('availability_slots').delete()).select('id')
      if (Array.isArray(gone) && gone.length > 0) await admin.from('slot_services').delete().eq('slot_id', slot.id)
      continue
    }
    if (keepBefore && !keepAfter) {
      await guard(admin.from('availability_slots').update({ ends_at: startIso, pending_confirm: false }))
      continue
    }
    if (!keepBefore && keepAfter) {
      await guard(admin.from('availability_slots').update({ starts_at: endIso, pending_confirm: false }))
      continue
    }
    // Rezervace uprostřed okna: původní okno končí jejím začátkem, za ní vznikne nové se stejnými službami
    const { data: shrunk } = await guard(admin.from('availability_slots').update({ ends_at: startIso, pending_confirm: false })).select('id')
    if (!Array.isArray(shrunk) || shrunk.length === 0) continue
    const { data: tail } = await admin
      .from('availability_slots')
      .insert({ provider_id: args.providerId, starts_at: endIso, ends_at: slot.ends_at, status: 'volno', pending_confirm: false })
      .select('id')
      .single()
    if (!tail) continue
    const { data: links } = await admin
      .from('slot_services')
      .select('service_id, item_ids')
      .eq('slot_id', slot.id) as { data: { service_id: string; item_ids: string[] | null }[] | null }
    if ((links ?? []).length > 0) {
      await admin.from('slot_services').insert((links ?? []).map((l) => ({ slot_id: tail.id, service_id: l.service_id, item_ids: l.item_ids ?? null })))
    }
  }
}
