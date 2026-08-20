// lib/slot-merge.ts
// Uvolnění rezervovaného úseku a slepení okna zpátky dohromady.
//
// PROČ: rezervace okno rozdělí — z 8:00–10:00 vznikne 8:00–8:23 (zabráno)
// a 8:23–10:00 (zbytek). Když se rezervace zruší (nezaplacená platba, odchod
// z platební stránky, cron), samotné vrácení úseku na „volno" by poskytovateli
// nechalo v kalendáři dva kusy místo původního okna — a v tom kratším by se
// nabízel jen úkon, který se do 23 minut vejde.
//
// Tahle funkce úsek uvolní a hned ho slepí se sousedy: navazuje-li na něj
// volné okno těsně před nebo za, spojí se do jednoho a služby se sečtou.
// Výsledek je stav, jako by rezervace nikdy nebyla.
//
// Používá se z webhooku (vypršelá platba), z detailu objednávky (odchod
// z platby) a z cronu. Pracuje se service-role klientem, který jí volající
// předá — sama žádný nezakládá.

type AdminClient = any

type SlotRow = {
  id: string
  provider_id: string
  starts_at: string
  ends_at: string
  status: string
  pending_confirm: boolean | null
}

/**
 * Uvolní úsek a slepí ho se sousedními volnými okny.
 *
 * @param admin  Supabase klient se service role
 * @param slotId Úsek, který se uvolňuje
 * @param orderId Když je zadané, úsek se uvolní jen pokud na něm sedí tahle
 *                objednávka — cizí ani mezitím přeobsazený termín se nesáhne.
 * @returns true, když se úsek opravdu uvolnil
 */
export async function releaseSlotAndMerge(
  admin: AdminClient,
  slotId: string,
  orderId?: string | null
): Promise<boolean> {
  // 1) Uvolnit úsek
  let q = admin
    .from('availability_slots')
    .update({ status: 'volno', order_id: null, pending_confirm: false })
    .eq('id', slotId)
  if (orderId) q = q.eq('order_id', orderId)

  const { data: freed } = await q.select('id, provider_id, starts_at, ends_at, status, pending_confirm')
  if (!Array.isArray(freed) || freed.length === 0) return false

  let current = freed[0] as SlotRow

  // 2) Slepit se sousedy. Bereme jen okna téhož poskytovatele, která na sebe
  //    přesně navazují a jsou volná — včetně zbytků čekajících na rozhodnutí
  //    (ty po slepení stejně přestávají dávat smysl).
  //
  //    Cyklus běží max třikrát: úsek může mít souseda před sebou a za sebou,
  //    třetí kolo je pojistka, ne očekávaný stav.
  for (let i = 0; i < 3; i++) {
    const { data: sousedi } = await admin
      .from('availability_slots')
      .select('id, provider_id, starts_at, ends_at, status, pending_confirm')
      .eq('provider_id', current.provider_id)
      .eq('status', 'volno')
      .neq('id', current.id)
      .or(`ends_at.eq.${current.starts_at},starts_at.eq.${current.ends_at}`)
      .limit(2) as { data: SlotRow[] | null }

    const soused = (sousedi ?? [])[0]
    if (!soused) break

    const novyStart = new Date(soused.starts_at) < new Date(current.starts_at)
      ? soused.starts_at
      : current.starts_at
    const novyKonec = new Date(soused.ends_at) > new Date(current.ends_at)
      ? soused.ends_at
      : current.ends_at

    // Služby obou oken se sečtou — po slepení má být v nabídce všechno,
    // co poskytovatel k původnímu oknu zaškrtl.
    const { data: linkyCurrent } = await admin
      .from('slot_services').select('service_id').eq('slot_id', current.id) as { data: { service_id: string }[] | null }
    const { data: linkySoused } = await admin
      .from('slot_services').select('service_id').eq('slot_id', soused.id) as { data: { service_id: string }[] | null }

    const mam = new Set((linkyCurrent ?? []).map((l) => l.service_id))
    const chybi = (linkySoused ?? [])
      .map((l) => l.service_id)
      .filter((id) => !mam.has(id))

    // Roztáhnout současný úsek přes oba — jen když soused pořád existuje
    // a je volný (mezitím si ho mohl někdo vzít).
    const { data: rozsireno } = await admin
      .from('availability_slots')
      .update({ starts_at: novyStart, ends_at: novyKonec, pending_confirm: false })
      .eq('id', current.id)
      .eq('status', 'volno')
      .select('id, provider_id, starts_at, ends_at, status, pending_confirm')

    if (!Array.isArray(rozsireno) || rozsireno.length === 0) break

    if (chybi.length > 0) {
      await admin.from('slot_services').insert(
        chybi.map((sid) => ({ slot_id: current.id, service_id: sid }))
      )
    }

    // Souseda zrušit — nejdřív vazby, pak samotné okno, a jen dokud je volný.
    await admin.from('slot_services').delete().eq('slot_id', soused.id)
    await admin.from('availability_slots').delete().eq('id', soused.id).eq('status', 'volno')

    current = rozsireno[0] as SlotRow
  }

  return true
}