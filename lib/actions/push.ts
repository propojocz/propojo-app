'use server'
import webpush from 'web-push'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

// Admin klient (obchází RLS) — odesílání běží na serveru pro cizí uživatele.
function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

let vapidReady = false

// Nastaví VAPID klíče. Když klíče chybí, push se tiše přeskočí
// (stejná logika jako u e-mailů bez RESEND_API_KEY).
function configureVapid(): boolean {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey) return false
  if (!vapidReady) {
    webpush.setVapidDetails('mailto:admin@propojo.cz', publicKey, privateKey)
    vapidReady = true
  }
  return true
}

export type PushSubscriptionInput = {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

// Uloží odběr přihlášeného uživatele. Volá se z prohlížeče po povolení notifikací.
export async function savePushSubscription(
  sub: PushSubscriptionInput,
  userAgent?: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nejste přihlášeni.' }

  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    return { success: false, error: 'Neplatný odběr notifikací.' }
  }

  const { error } = await (getAdminClient().from('push_subscriptions') as any)
    .upsert(
      {
        user_id: user.id,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        user_agent: userAgent ?? null,
      },
      { onConflict: 'endpoint' }
    )

  if (error) {
    console.error('[savePushSubscription]', error)
    return { success: false, error: 'Odběr se nepodařilo uložit.' }
  }
  return { success: true }
}

// Smaže odběr (uživatel notifikace vypnul).
export async function deletePushSubscription(
  endpoint: string
): Promise<{ success: boolean }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false }

  const { error } = await (getAdminClient().from('push_subscriptions') as any)
    .delete()
    .eq('endpoint', endpoint)
    .eq('user_id', user.id)

  if (error) {
    console.error('[deletePushSubscription]', error)
    return { success: false }
  }
  return { success: true }
}

// Odešle push všem zařízením daného uživatele.
// Selhává tiše — push nikdy nesmí shodit hlavní akci (objednávku, zprávu).
export async function sendPush(params: {
  userId: string
  title: string
  body?: string | null
  url?: string
  tag?: string
}): Promise<void> {
  if (!configureVapid()) return

  try {
    const admin = getAdminClient()
    const { data, error } = await admin
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('user_id', params.userId) as { data: any[] | null; error: any }

    if (error) {
      console.error('[sendPush] načtení odběrů:', error)
      return
    }
    if (!data || data.length === 0) return

    const payload = JSON.stringify({
      title: params.title,
      body: params.body ?? '',
      url: params.url ?? '/dashboard/objednavky',
      tag: params.tag,
    })

    await Promise.all(
      data.map(async (row) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: row.endpoint,
              keys: { p256dh: row.p256dh, auth: row.auth },
            },
            payload
          )
        } catch (err: any) {
          const code = err?.statusCode
          // 404/410 = odběr už neplatí (odinstalovaný prohlížeč, smazané povolení).
          if (code === 404 || code === 410) {
            await (admin.from('push_subscriptions') as any)
              .delete()
              .eq('endpoint', row.endpoint)
          } else {
            console.error('[sendPush]', code, err?.body ?? err)
          }
        }
      })
    )
  } catch (err) {
    console.error('[sendPush] neočekávaná chyba:', err)
  }
}