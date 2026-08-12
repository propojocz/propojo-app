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