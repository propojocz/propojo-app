'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Ověří, že přihlášený uživatel je admin. Vrací user id, nebo null.
async function requireAdmin(): Promise<string | null> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single() as { data: { is_admin: boolean } | null }
  return data?.is_admin === true ? user.id : null
}

export type LeadRow = {
  id: string
  email: string
  category: string | null
  description: string
  city: string
  phone: string | null
  preferred_date: string | null
  status: string
  created_at: string
  photos: string[] | null
}

// Načte poptávky (volitelně filtr podle stavu).
export async function getLeads(status?: string): Promise<LeadRow[]> {
  const adminId = await requireAdmin()
  if (!adminId) return []

  const admin = getAdminClient()
  let query = admin.from('leads').select('*').order('created_at', { ascending: false })
  if (status && status !== 'vse') query = query.eq('status', status)

  const { data, error } = await query as { data: LeadRow[] | null; error: any }
  if (error) { console.error('[getLeads]', error); return [] }
  return data ?? []
}

// Změní stav poptávky (nova / vyrizena).
export async function setLeadStatus(leadId: string, status: string): Promise<{ success: boolean }> {
  const adminId = await requireAdmin()
  if (!adminId) return { success: false }

  const admin = getAdminClient()
  const { error } = await (admin.from('leads') as any).update({ status }).eq('id', leadId)
  if (error) { console.error('[setLeadStatus]', error); return { success: false } }

  revalidatePath('/admin/poptavky')
  return { success: true }
}

export type AdminUserRow = {
  id: string
  full_name: string | null
  company_name: string | null
  city: string | null
  is_provider: boolean
  is_admin: boolean
  is_suspended: boolean | null
  suspend_reason: string | null
  ico: string | null
  created_at: string
}

// Načte uživatele (volitelně hledání podle jména/firmy).
export async function getUsers(search?: string): Promise<AdminUserRow[]> {
  const adminId = await requireAdmin()
  if (!adminId) return []

  const admin = getAdminClient()
  let query = admin
    .from('profiles')
    .select('id, full_name, company_name, city, is_provider, is_admin, is_suspended, suspend_reason, ico, created_at')
    .order('created_at', { ascending: false })
    .limit(100)

  if (search && search.trim()) {
    const s = `%${search.trim()}%`
    query = query.or(`full_name.ilike.${s},company_name.ilike.${s}`)
  }

  const { data, error } = await query as { data: AdminUserRow[] | null; error: any }
  if (error) { console.error('[getUsers]', error); return [] }
  return data ?? []
}

// Pozastaví / obnoví uživatele. Při pozastavení lze uvést důvod (uvidí ho uživatel).
export async function setUserSuspended(
  userId: string,
  suspended: boolean,
  reason?: string
): Promise<{ success: boolean }> {
  const adminId = await requireAdmin()
  if (!adminId) return { success: false }
  if (userId === adminId) return { success: false } // sám sebe ne

  const admin = getAdminClient()
  const { error } = await (admin.from('profiles') as any)
    .update({
      is_suspended: suspended,
      // Při pozastavení uložíme důvod, při obnovení ho smažeme
      suspend_reason: suspended ? (reason?.trim() || null) : null,
    })
    .eq('id', userId)
  if (error) { console.error('[setUserSuspended]', error); return { success: false } }

  revalidatePath('/admin/uzivatele')
  return { success: true }
}