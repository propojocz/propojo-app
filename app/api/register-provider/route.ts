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

/**
 * Serverové ověření IČO proti ARES.
 * Klientské ověření (v prohlížeči) lze obejít – proto ověřujeme znovu tady.
 * Vrací obchodní jméno z ARES, nebo null pokud IČO neexistuje / ARES nedostupný.
 */
async function verifyIcoInAres(ico: string): Promise<{ ok: boolean; companyName?: string }> {
  try {
    const res = await fetch(
      `https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/${ico}`,
      { headers: { accept: 'application/json' }, cache: 'no-store' }
    )
    if (!res.ok) return { ok: false }
    const data = await res.json()
    const name = data?.obchodniJmeno
    if (!name) return { ok: false }
    return { ok: true, companyName: name }
  } catch (err) {
    console.error('[register-provider] ARES ověření selhalo:', err)
    return { ok: false }
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Neplatná data.' }, { status: 400 })

    const { email, password, full_name, phone, city, ico } = parsed.data

    // 1) Ověřit IČO proti ARES ještě PŘED založením účtu
    const ares = await verifyIcoInAres(ico)
    if (!ares.ok) {
      return NextResponse.json(
        { error: 'IČO se nepodařilo ověřit v registru ARES. Zkontrolujte prosím zadané číslo.' },
        { status: 400 }
      )
    }
    // Obchodní jméno bereme z ARES, ne z toho, co poslal prohlížeč
    const company_name = ares.companyName ?? parsed.data.company_name ?? null

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
      // 2) Uložit VŠECHNA data včetně IČO.
      //    POZOR: tenhle update MUSÍ běžet přes service role.
      //    Anon/authenticated klient by narazil na ochranný trigger
      //    protect_profile_columns, který chrání ico, is_provider,
      //    company_name atd. — a hodnoty by zahodil (uložil by se
      //    prázdný profil „jako uživatel bez IČO").
      const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )
      const { error: profileError } = await admin
        .from('profiles')
        .update({
          full_name,
          phone,
          city,
          ico,
          ico_verified: true,
          company_name,
          is_provider: true,
        })
        .eq('id', authData.user.id)

      if (profileError) {
        console.error('[register-provider] uložení profilu selhalo:', profileError)
      }

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