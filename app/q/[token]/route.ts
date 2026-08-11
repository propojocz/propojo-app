// app/q/[token]/route.ts
// Krátký odkaz z QR kódu: propojo.cz/q/ab3f9k
//
// Zaznamená načtení a hned pošle návštěvníka na kartu s ceníkem.
// Musí být RYCHLÝ — člověk stojí u zrcadla s telefonem v ruce.
// Neukládáme IP ani cookies, jen že k načtení došlo.

import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(
  _request: Request,
  { params }: { params: { token: string } }
) {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://propojo.cz'
  const token = (params.token ?? '').toLowerCase().trim()

  if (!token) return NextResponse.redirect(base)

  try {
    const admin = getAdminClient()
    const { data } = await admin.rpc('qr_zaznamenat_nacteni', { p_token: token }) as { data: any }

    const radek = Array.isArray(data) ? data[0] : data
    if (!radek) {
      // Neplatný kód → pošleme na marketplace, ať návštěvník neskončí v prázdnu.
      return NextResponse.redirect(`${base}/marketplace`)
    }

    if (radek.service_id) {
      const ukon = radek.service_item_id ? `?ukon=${radek.service_item_id}` : ''
      return NextResponse.redirect(`${base}/sluzby/${radek.service_id}${ukon}`)
    }
    return NextResponse.redirect(`${base}/profil/${radek.provider_id}`)
  } catch (e) {
    console.error('[q/token]', e)
    return NextResponse.redirect(`${base}/marketplace`)
  }
}