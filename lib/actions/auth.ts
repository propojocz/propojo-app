'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { AuthResult } from './types'

export async function login(values: { email: string; password: string }): Promise<AuthResult> {
  const supabase = createClient()
  const { error } = await supabase.auth.signInWithPassword({ email: values.email, password: values.password })
  if (error) {
    if (error.message.includes('Invalid login credentials')) return { success: false, error: 'Špatný email nebo heslo.' }
    if (error.message.includes('Email not confirmed')) return { success: false, error: 'Potvrďte svůj email.' }
    return { success: false, error: 'Přihlášení se nezdařilo.' }
  }
  revalidatePath('/', 'layout')
  return { success: true }
}

export async function register(values: { email: string; password: string; full_name: string; is_provider?: boolean }): Promise<AuthResult> {
  const supabase = createClient()
  const { error } = await supabase.auth.signUp({
    email: values.email,
    password: values.password,
    options: {
      data: { full_name: values.full_name, is_provider: false },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    },
  })
  if (error) {
    if (error.message.includes('already registered')) return { success: false, error: 'Tento email je již zaregistrován.' }
    return { success: false, error: 'Registrace se nezdařila.' }
  }
  return { success: true }
}

export async function logout(): Promise<void> {
  const supabase = createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/')
}
