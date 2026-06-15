'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

// Admin klient (obchází RLS) — používá se jen na serveru pro zápis oznámení.
function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export type NotificationRow = {
  id: string
  user_id: string
  type: string
  order_id: string | null
  actor_id: string | null
  title: string
  preview: string | null
  read_at: string | null
  created_at: string
}

// Založení oznámení. Volá se ze serveru (např. ze sendOrderMessage / updateOrderStatus).
// Selže tiše — oznámení nikdy nesmí shodit hlavní akci (zprávu/změnu stavu).
export async function createNotification(params: {
  userId: string
  type: 'new_message' | 'status_change'
  orderId?: string | null
  actorId?: string | null
  title: string
  preview?: string | null
}): Promise<void> {
  try {
    const admin = getAdminClient()
    const { error } = await (admin.from('notifications') as any).insert({
      user_id: params.userId,
      type: params.type,
      order_id: params.orderId ?? null,
      actor_id: params.actorId ?? null,
      title: params.title,
      preview: params.preview ?? null,
    })
    if (error) console.error('[createNotification]', error)
  } catch (err) {
    console.error('[createNotification] neočekávaná chyba:', err)
  }
}

// Načtení oznámení přihlášeného uživatele + počet nepřečtených.
export async function getNotifications(): Promise<{
  items: NotificationRow[]
  unread: number
}> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { items: [], unread: 0 }

  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20) as { data: NotificationRow[] | null; error: any }

  if (error || !data) {
    console.error('[getNotifications]', error)
    return { items: [], unread: 0 }
  }

  const unread = data.filter((n) => n.read_at === null).length
  return { items: data, unread }
}

// Označení všech oznámení uživatele jako přečtená.
export async function markAllNotificationsRead(): Promise<{ success: boolean }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false }

  const { error } = await (supabase.from('notifications') as any)
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .is('read_at', null)

  if (error) {
    console.error('[markAllNotificationsRead]', error)
    return { success: false }
  }

  revalidatePath('/dashboard')
  return { success: true }
}