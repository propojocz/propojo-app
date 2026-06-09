'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { ServiceFormValues, ActionResult } from './types'

const serviceSchema = z.object({
  title: z.string().min(5).max(100),
  description: z.string().min(20).max(2000),
  category: z.enum(['remesla','instalaterstvi','elektrika','malirstvi','tesarstvi','zahradnictvi','uklid','it_sluzby','doprava','jine'] as const),
  price: z.number().positive().max(999999),
  price_unit: z.enum(['hod','kus','den','projekt'] as const),
  city: z.string().min(2).max(100),
  image_url: z.string().url().optional().or(z.literal('')),
})

export async function createService(values: ServiceFormValues): Promise<ActionResult> {
  const supabase = createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, error: 'Nejste přihlášeni.' }
  const parsed = serviceSchema.safeParse(values)
  if (!parsed.success) return { success: false, error: 'Formulář obsahuje chyby.', fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  const { image_url, ...rest } = parsed.data
  const { data, error } = await supabase.from('services').insert({ ...rest, provider_id: user.id, image_url: image_url || null }).select('id').single()
  if (error) return { success: false, error: 'Nepodařilo se uložit službu.' }
  revalidatePath('/'); revalidatePath('/marketplace')
  return { success: true, id: data.id }
}

export async function updateService(id: string, values: ServiceFormValues): Promise<ActionResult> {
  const supabase = createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, error: 'Nejste přihlášeni.' }
  const parsed = serviceSchema.safeParse(values)
  if (!parsed.success) return { success: false, error: 'Formulář obsahuje chyby.' }
  const { image_url, ...rest } = parsed.data
  const { error } = await supabase.from('services').update({ ...rest, image_url: image_url || null }).eq('id', id).eq('provider_id', user.id)
  if (error) return { success: false, error: 'Nepodařilo se uložit změny.' }
  revalidatePath('/'); revalidatePath('/marketplace'); revalidatePath(`/sluzby/${id}`)
  return { success: true, id }
}

export async function deleteService(id: string): Promise<ActionResult> {
  const supabase = createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, error: 'Nejste přihlášeni.' }
  const { error } = await supabase.from('services').delete().eq('id', id).eq('provider_id', user.id)
  if (error) return { success: false, error: 'Nepodařilo se smazat.' }
  revalidatePath('/'); revalidatePath('/marketplace')
  return { success: true, id }
}

export async function toggleServiceActive(id: string, is_active: boolean): Promise<ActionResult> {
  const supabase = createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, error: 'Nejste přihlášeni.' }
  const { error } = await supabase.from('services').update({ is_active }).eq('id', id).eq('provider_id', user.id)
  if (error) return { success: false, error: 'Nepodařilo se změnit stav.' }
  revalidatePath('/'); revalidatePath('/marketplace')
  return { success: true, id }
}
