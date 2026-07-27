// app/api/push-test/route.ts
// DOČASNÉ — slouží jen k ověření, že push notifikace fungují.
// Otevři v prohlížeči: https://propojo.cz/api/push-test
// Až bude vše otestované, můžeš celý soubor smazat.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendPush } from '@/lib/actions/push'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json(
      { ok: false, duvod: 'Nejste přihlášeni — přihlaste se a zkuste znovu.' },
      { status: 401 }
    )
  }

  // Kolik zařízení má tenhle účet přihlášených k odběru?
  const { count } = await supabase
    .from('push_subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)

  const zarizeni = count ?? 0

  if (zarizeni === 0) {
    return NextResponse.json({
      ok: false,
      zarizeni: 0,
      duvod:
        'Tento účet nemá žádné zařízení přihlášené k odběru. Otevřete Propojo na telefonu a na dashboardu klikněte na „Zapnout".',
    })
  }

  const klice = Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY
  )

  if (!klice) {
    return NextResponse.json({
      ok: false,
      zarizeni,
      duvod:
        'Na serveru chybí VAPID klíče. Doplňte je ve Vercelu (Settings → Environment Variables) a dejte Redeploy.',
    })
  }

  await sendPush({
    userId: user.id,
    title: 'Testovací upozornění',
    body: 'Když tohle vidíte na telefonu, push notifikace fungují.',
    url: '/dashboard',
    tag: 'test',
  })

  return NextResponse.json({
    ok: true,
    zarizeni,
    zprava: `Push odeslán na ${zarizeni} zařízení. Koukněte na telefon.`,
  })
}