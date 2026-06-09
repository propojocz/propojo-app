// app/api/register-provider/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { welcomeEmail } from '@/lib/email/templates'
import { z } from 'zod'

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  full_name: z.string().min(2),
  ico: z.string().regex(/^\d{8}$/),
  phone: z.string().min(9),
  city: z.string().min(2),
  company_name: z.string().optional(),
})

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Neplatná data.' }, { status: 400 })

    const { email, password, full_name, phone, city } = parsed.data

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name, is_provider: true },
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/onboarding`,
      },
    })

    if (authError) {
      if (authError.message.includes('already registered')) {
        return NextResponse.json({ error: 'Tento email je již zaregistrován.' }, { status: 409 })
      }
      return NextResponse.json({ error: authError.message }, { status: 500 })
    }

    if (authData.user) {
      await supabase.from('profiles').update({ full_name, phone, city, is_provider: true }).eq('id', authData.user.id)

      // Welcome email
      try {
        const resend = new Resend(process.env.RESEND_API_KEY)
        const { subject, html } = welcomeEmail({
          name: full_name,
          isProvider: true,
          loginUrl: `${process.env.NEXT_PUBLIC_APP_URL}/prihlasit`,
        })
        await resend.emails.send({
          from: 'Propojo <notifikace@propojo.cz>',
          to: email,
          subject,
          html,
        })
      } catch (err) {
        console.error('[register-provider] welcome email error:', err)
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[register-provider]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
