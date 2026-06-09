'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { ActionResult } from './types'

export async function createReview(values: {
  order_id: string
  provider_id: string
  rating: number
  comment?: string
}): Promise<ActionResult> {
  const supabase = createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, error: 'Nejste přihlášeni.' }

  // Ověř že objednávka patří tomuto zákazníkovi a je dokončená
  const { data: order } = await supabase
    .from('orders')
    .select('id, status, client_id')
    .eq('id', values.order_id)
    .eq('client_id', user.id)
    .eq('status', 'dokonceno')
    .single()

  if (!order) return { success: false, error: 'Recenzi lze přidat pouze k dokončené objednávce.' }

  // Zkontroluj jestli recenze již neexistuje
  const { data: existing } = await supabase
    .from('reviews')
    .select('id')
    .eq('order_id', values.order_id)
    .single()

  if (existing) return { success: false, error: 'Tuto objednávku jste již ohodnotili.' }

  const { data, error } = await supabase
    .from('reviews')
    .insert({
      order_id: values.order_id,
      reviewer_id: user.id,
      provider_id: values.provider_id,
      rating: values.rating,
      comment: values.comment || null,
    })
    .select('id')
    .single()

  if (error) return { success: false, error: 'Nepodařilo se uložit recenzi.' }

  revalidatePath(`/profil/${values.provider_id}`)
  revalidatePath('/dashboard/objednavky')
  return { success: true, id: data.id }
}
