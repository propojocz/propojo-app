'use server'
// lib/actions/order-alerts.ts
// Kolik objednávek na mě čeká — abych je nemusel hledat.
//
// Zákazník si zarezervuje termín, objednávka vznikne se stavem „čeká na úhradu"
// a on odejde z obrazovky. Pak ji nenajde a rezervace propadne. Proto v menu
// u Objednávek svítí číslo, dokud něco nedodělal.

import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Objednávky, kde MUSÍ zákazník něco udělat:
//  - čeká se na jeho platbu (deposit_status = 'pending')
//  - poskytovatel označil hotovo a čeká na potvrzení (ceka_potvrzeni)
export async function getCustomerTodoCount(): Promise<number> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 0

  const admin = getAdminClient()

  const { count: kZaplaceni } = await admin
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('customer_id', user.id)
    .eq('deposit_status', 'pending')
    .not('status', 'in', '("zruseno","dokonceno")')

  const { count: kPotvrzeni } = await admin
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('customer_id', user.id)
    .eq('status', 'ceka_potvrzeni')

  return (kZaplaceni ?? 0) + (kPotvrzeni ?? 0)
}
// Objednávky, kde MUSÍ něco udělat POSKYTOVATEL:
//  - výrobek čeká na jeho potvrzení (běží mu lhůta, po ní objednávka propadne)
//  - služba čeká na přijetí (stav 'cekajici')
//  - zaplacená objednávka čeká na uzavření / předání
//
// Bez tohohle se provider o běžící lhůtě dozví jen z notifikace, která zapadne —
// a objednávka mu propadne, aniž by věděl proč.
export async function getProviderTodoCount(): Promise<number> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 0

  const admin = getAdminClient()

  // Čeká na vyjádření poskytovatele (výrobek i služba).
  const { count: kPotvrzeni } = await admin
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('provider_id', user.id)
    .eq('status', 'cekajici')

  // Přijaté objednávky, kde poskytovatel ještě něco musí udělat (uzavřít
  // zakázku, připravit a předat výrobek).
  //
  // Nepočítáme JEN zaplacené: u režimu „bez platby předem" se nic neplatí,
  // a přesto se objednávka musí dokončit. Zároveň nesmí odznak svítit týdny
  // dopředu u služby s termínem v budoucnu — proto se nezaplacené počítají,
  // až když termín nastal. Výrobek termín nemá (scheduled_at je null), takže
  // se počítá hned, jak má být.
  const { data: prijate } = await admin
    .from('orders')
    .select('id, deposit_status, scheduled_at')
    .eq('provider_id', user.id)
    .eq('status', 'prijato') as {
      data: Array<{ id: string; deposit_status: string | null; scheduled_at: string | null }> | null
    }

  const ted = Date.now()
  const kVyrizeni = (prijate ?? []).filter((o) => {
    if (o.deposit_status === 'paid') return true
    if (o.deposit_status === 'pending') return false   // čeká se na zákazníka
    // bez platby předem: až když termín nastal (u výrobku hned)
    return !o.scheduled_at || new Date(o.scheduled_at).getTime() <= ted
  }).length

  return (kPotvrzeni ?? 0) + kVyrizeni
}