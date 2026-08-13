'use server'
// lib/actions/inquiry.ts
// „Napsat poskytovateli" z karty nabídky.
//
// Nezakládá druhý systém zpráv — použije ten, co už máme: vytvoří DOTAZ
// (objednávku ve stavu 'cekajici', bez termínu a bez platby) a vrátí její id.
// Chat pak běží na detailu objednávky, takže obě strany mají konverzaci
// tam, kde ji hledají, a když se domluví, ta samá objednávka pokračuje
// do termínu a platby.
//
// Na dvojici zákazník + karta existuje VŽDY JEN JEDNO otevřené vlákno.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createNotification } from './notifications'

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

type Vysledek =
  | { success: true; orderId: string; novy: boolean }
  | { success: false; error: string }

export async function zacniDotaz(serviceId: string): Promise<Vysledek> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nejste přihlášený.' }

  const admin = getAdminClient()

  const { data: svc } = await admin
    .from('services')
    .select('id, provider_id, title, city')
    .eq('id', serviceId)
    .maybeSingle() as { data: { id: string; provider_id: string; title: string | null; city: string | null } | null }

  if (!svc) return { success: false, error: 'Nabídka neexistuje.' }
  if (svc.provider_id === user.id) return { success: false, error: 'Tohle je vaše vlastní nabídka.' }

  // Už spolu o téhle kartě mluvíme? Pak jen otevřeme staré vlákno.
  const { data: existujici } = await admin
    .from('orders')
    .select('id')
    .eq('customer_id', user.id)
    .eq('service_id', serviceId)
    .not('status', 'in', '("zruseno","dokonceno")')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle() as { data: { id: string } | null }

  if (existujici) {
    return { success: true, orderId: existujici.id, novy: false }
  }

  // Nový dotaz — bez termínu, bez ceny, bez platby. Jen prostor na domluvu.
  const { data, error } = await (admin.from('orders') as any)
    .insert({
      service_id: serviceId,
      provider_id: svc.provider_id,
      customer_id: user.id,
      status: 'cekajici',
      // Zákazník si nic neobjednal — jen se ptá. Odliší to timeline i výpis.
      is_inquiry: true,
      location_city: svc.city ?? null,
      description: null,
    })
    .select('id')
    .single() as { data: { id: string } | null; error: any }

  if (error || !data) {
    console.error('[zacniDotaz]', error)
    return { success: false, error: 'Nepodařilo se otevřít konverzaci.' }
  }

  // Poskytovatel se to musí dozvědět, jinak dotaz zapadne.
  try {
    const { data: kdo } = await admin
      .from('profiles').select('full_name').eq('id', user.id).maybeSingle() as { data: { full_name: string | null } | null }
    await createNotification({
      userId: svc.provider_id,
      type: 'new_message',
      orderId: data.id,
      actorId: user.id,
      title: `Dotaz od ${kdo?.full_name ?? 'zákazníka'}`,
      preview: svc.title,
    })
  } catch (e) {
    console.error('[zacniDotaz] notifikace', e)
  }

  revalidatePath('/dashboard/objednavky')
  return { success: true, orderId: data.id, novy: true }
}