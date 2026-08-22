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
    .select('service_id')
    .eq('slot_id', slot.id) as { data: { service_id: string }[] | null }
  const serviceIds = Array.from(new Set((links ?? []).map((l) => l.service_id)))

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
        serviceIds.map((serviceId) => ({ slot_id: tail.id, service_id: serviceId }))
      )
    }
  }

  return booked.id as string
}
