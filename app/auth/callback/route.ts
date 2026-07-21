// app/auth/callback/route.ts
// Supabase Auth callback handler
//
// Po prvním potvrzení e-mailu pošleme uvítací e-mail (jednou).
// Dřív ho dostával jen řemeslník (z register-provider). Zákazník nedostal nic —
// tady to napravujeme pro obě role, a to až po potvrzení, ať nechodí dva maily naráz.

import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { welcomeEmail } from '@/lib/email/templates'
import { NextResponse } from 'next/server'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://propojo.cz'

async function maybeSendWelcome(userId: string, email: string | undefined) {
  if (!email || !process.env.RESEND_API_KEY) return

  try {
    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Načteme profil — a hlavně příznak, jestli už uvítací mail odešel.
    const { data: profile } = await admin
      .from('profiles')
      .select('full_name, is_provider, welcome_sent')
      .eq('id', userId)
      .single() as { data: { full_name: string | null; is_provider: boolean | null; welcome_sent: boolean | null } | null }

    // Už odeslán? Nic neděláme (callback může proběhnout víckrát).
    if (!profile || profile.welcome_sent === true) return

    const resend = new Resend(process.env.RESEND_API_KEY)
    const { subject, html } = welcomeEmail({
      name: profile.full_name ?? 'vítejte',
      isProvider: profile.is_provider === true,
      loginUrl: profile.is_provider === true
        ? `${APP_URL}/dashboard`
        : `${APP_URL}/marketplace`,
    })

    await resend.emails.send({
      from: 'Propojo <notifikace@propojo.cz>',
      to: email,
      subject,
      html,
    })

    // Označíme, že odešel — aby nechodil při každém dalším přihlášení.
    await (admin.from('profiles') as any)
      .update({ welcome_sent: true })
      .eq('id', userId)
  } catch (err) {
    // Uvítací mail je „nice to have" — když selže, přihlášení tím nerozbijeme.
    console.error('[auth/callback] uvítací e-mail:', err)
  }
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const supabase = createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // Po úspěšném potvrzení zkusíme (jednorázově) poslat uvítací e-mail.
      if (data.user) {
        await maybeSendWelcome(data.user.id, data.user.email)
      }
      // Session z potvrzovacího odkazu NECHÁVÁME — uživatel je tím rovnou přihlášený
      // a nemusí zadávat heslo hned po potvrzení e-mailu. (Dřív jsme ho tu odhlašovali,
      // což bylo zbytečné otravné: exchangeCodeForSession vytvoří session právě pro ten
      // účet, který se potvrdil, takže se nikdo nemůže „přepnout" na cizí profil.)
      //
      // Kam poslat: poskytovatele do dashboardu, zákazníka do marketplace.
      let target = next !== '/' ? next : '/marketplace'
      if (next === '/') {
        try {
          const { data: prof } = await supabase
            .from('profiles')
            .select('is_provider')
            .eq('id', data.user!.id)
            .single() as { data: { is_provider: boolean | null } | null }
          if (prof?.is_provider === true) target = '/dashboard'
        } catch {
          // když se profil nepodaří načíst, zůstane marketplace
        }
      }

      const url = new URL(target, origin)
      url.searchParams.set('potvrzeno', '1')
      return NextResponse.redirect(url.toString())
    }
  }

  return NextResponse.redirect(`${origin}/prihlasit?error=auth`)
}