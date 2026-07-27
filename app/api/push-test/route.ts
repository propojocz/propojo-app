// app/api/push-test/route.ts
// DOČASNÉ — diagnostika push notifikací.
// Otevři v prohlížeči: https://propojo.cz/api/push-test
// Ukáže výsledek odeslání pro KAŽDÉ zařízení zvlášť, včetně chyby od Applu/Googlu.
import { NextResponse } from 'next/server'
import webpush from 'web-push'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Z endpointu se dá poznat, kam push míří: Apple = iPhone, Google = Chrome.
function sluzba(endpoint: string): string {
  if (endpoint.includes('push.apple.com')) return 'Apple (iPhone/Mac)'
  if (endpoint.includes('fcm.googleapis.com')) return 'Google (Chrome/Android)'
  if (endpoint.includes('mozilla')) return 'Mozilla (Firefox)'
  if (endpoint.includes('windows.com')) return 'Microsoft (Edge)'
  return 'neznámá služba'
}

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json(
      { ok: false, duvod: 'Nejste přihlášeni — přihlaste se a zkuste znovu.' },
      { status: 401 }
    )
  }

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY

  if (!publicKey || !privateKey) {
    return NextResponse.json({
      ok: false,
      duvod:
        'Na serveru chybí VAPID klíče. Doplňte je ve Vercelu (Settings → Environment Variables) a dejte Redeploy.',
      chybi: {
        NEXT_PUBLIC_VAPID_PUBLIC_KEY: !publicKey,
        VAPID_PRIVATE_KEY: !privateKey,
      },
    })
  }

  webpush.setVapidDetails('mailto:admin@propojo.cz', publicKey, privateKey)

  const admin = getAdminClient()
  const { data, error } = await admin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth, user_agent, created_at')
    .eq('user_id', user.id) as { data: any[] | null; error: any }

  if (error) {
    return NextResponse.json({ ok: false, duvod: 'Nepodařilo se načíst odběry.', chyba: String(error?.message ?? error) })
  }

  if (!data || data.length === 0) {
    return NextResponse.json({
      ok: false,
      zarizeni: 0,
      duvod:
        'Tento účet nemá žádné zařízení přihlášené k odběru. Otevřete Propojo a klikněte na „Zapnout".',
    })
  }

  const payload = JSON.stringify({
    title: 'Testovací upozornění',
    body: 'Když tohle vidíte, push notifikace fungují.',
    url: '/dashboard',
    tag: 'test',
  })

  const vysledky = await Promise.all(
    data.map(async (row) => {
      const popis = {
        sluzba: sluzba(row.endpoint),
        zarizeni: String(row.user_agent ?? '').slice(0, 60),
        prihlaseno: row.created_at,
      }
      try {
        const res = await webpush.sendNotification(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
          payload
        )
        return { ...popis, stav: 'ODESLÁNO', kod: res.statusCode }
      } catch (err: any) {
        return {
          ...popis,
          stav: 'CHYBA',
          kod: err?.statusCode ?? null,
          hlaseni: String(err?.body ?? err?.message ?? err).slice(0, 300),
        }
      }
    })
  )

  const uspesne = vysledky.filter((v) => v.stav === 'ODESLÁNO').length

  return NextResponse.json({
    ok: uspesne > 0,
    zarizeni: data.length,
    odeslano: uspesne,
    vysledky,
  })
}