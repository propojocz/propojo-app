// app/dashboard/poptavky/page.tsx
// Moje poptávky (pohled zákazníka). Jen seznam vlastních poptávek + odkaz na
// zájemce a případně na vzniklou objednávku. Žádná editace ani statistiky.
// Stejný seznam vidí zákazník i na /poptavky (loadMyRequests).

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import MojePoptavkyList from '@/components/ui/MojePoptavkyList'
import { loadMyRequests } from '@/lib/my-requests'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Moje poptávky | Propojo' }

export default async function MojePoptavkyPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/prihlasit?next=/dashboard/poptavky')

  return <MojePoptavkyList items={await loadMyRequests(user.id)} />
}
