'use server'
// lib/actions/reserve-time.ts
// VRSTVA 3c — rezervace konkrétního času z otevírací doby.
//
// Tok: zákazník klikne na čas → vznikne objednávka se zámkem na 10 minut →
// zaplatí zálohu → potvrzeno. Když úkon zálohu nemá, je potvrzeno hned.
//
// Zámek NENÍ držení termínu. Je to jen okno na dokončení platby: ostatním se
// čas ukáže zašedle a po vypršení se sám vrátí mezi volné (viz free-times.ts,
// kde se prošlý zámek přestane počítat jako obsazený).
//
// Rozdíl proti reserveSlotForItem v slots.ts: tam se zabírá VYPSANÉ okno
// (availability_slots). Tady se rezervuje čas vygenerovaný z otevírací doby,
// žádné okno k němu neexistuje.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createNotification } from '@/lib/actions/notifications'
import { getFreeTimes } from '@/lib/actions/free-times'

const HOLD_MINUTES = 10

type Result =
  | { success: true; id: string; needsPayment: boolean }
  | { success: false; error: string }

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371
  const dLat = ((bLat - aLat) * Math.PI) / 180
  const dLng = ((bLng - aLng) * Math.PI) / 180
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
}

export async function reserveTime(values: {
  service_id: string
  service_item_id: string
  /** ISO začátek vybraného termínu */
  start: string
  message?: string
  location_city?: string
}): Promise<Result> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Pro rezervaci se musíte přihlásit.' }

  const admin = getAdminClient()

  // ── Úkon ───────────────────────────────────────────────────
  const { data: item } = await admin
    .from('service_items')
    .select('id, service_id, name, duration_minutes, buffer_minutes, deposit_amount, payment_model, is_active, price')
    .eq('id', values.service_item_id)
    .single() as { data: any }

  if (!item || item.service_id !== values.service_id) {
    return { success: false, error: 'Vybraný úkon nepatří k této kartě.' }
  }
  if (item.is_active !== true) return { success: false, error: 'Tento úkon už není k objednání.' }
  if (item.payment_model === 'B') {
    return { success: false, error: 'Nacenění na místě se objednává jako poptávka, ne na konkrétní čas.' }
  }

  const duration = Number(item.duration_minutes ?? 0)
  if (duration <= 0) return { success: false, error: 'U tohoto úkonu není nastavená délka.' }

  // ── Karta ──────────────────────────────────────────────────
  const { data: card } = await admin
    .from('services')
    .select('id, provider_id, location_type, city_lat, city_lng, radius_km, is_active')
    .eq('id', values.service_id)
    .single() as { data: any }

  if (!card || card.is_active !== true) return { success: false, error: 'Karta není dostupná.' }
  if (card.provider_id === user.id) {
    return { success: false, error: 'Vlastní termín si rezervovat nemůžete.' }
  }

  const { data: providerProfile } = await admin
    .from('profiles').select('is_suspended').eq('id', card.provider_id).single() as { data: any }
  if (providerProfile?.is_suspended === true) {
    return { success: false, error: 'Tento poskytovatel není momentálně dostupný.' }
  }

  const start = new Date(values.start)
  if (isNaN(start.getTime())) return { success: false, error: 'Neplatný termín.' }
  if (start.getTime() < Date.now()) return { success: false, error: 'Tento termín už proběhl.' }

  // ── Je ten čas opravdu volný? ──────────────────────────────
  // Ptáme se stejného generátoru, který časy nabídl — klientovi se věřit nedá.
  const days = await getFreeTimes(values.service_id, values.service_item_id)
  const offered = days
    .flatMap((d) => d.times)
    .find((t) => new Date(t.start).getTime() === start.getTime())

  if (!offered) {
    return { success: false, error: 'Tento termín už není volný. Vyberte prosím jiný.' }
  }
  if (offered.locked) {
    return { success: false, error: 'Tento termín si právě rezervuje někdo jiný. Zkuste ho za chvíli nebo vyberte jiný.' }
  }

  // ── Dosah (jen když se jezdí za zákazníkem) ────────────────
  const atCustomer = card.location_type !== 'u_poskytovatele'
  if (atCustomer && values.location_city && card.radius_km && card.city_lat != null && card.city_lng != null) {
    const { data: obec } = await admin
      .from('obce').select('latitude, longitude')
      .ilike('obec', values.location_city.trim()).limit(1).maybeSingle() as { data: any }
    if (obec) {
      const dist = distanceKm(card.city_lat, card.city_lng, obec.latitude, obec.longitude)
      if (dist > card.radius_km) {
        return {
          success: false,
          error: `Tato obec je mimo dosah poskytovatele (jezdí do ${card.radius_km} km, vaše obec je asi ${Math.round(dist)} km daleko).`,
        }
      }
    }
  }
  if (atCustomer && !values.location_city?.trim()) {
    return { success: false, error: 'Zadejte prosím město nebo obec, kde se má služba provést.' }
  }

  // ── Založení objednávky ────────────────────────────────────
  // scheduled_end obsahuje i pauzu — podle něj se počítá obsazenost kalendáře.
  const buffer = Number(item.buffer_minutes ?? 0)
  const endMs = start.getTime() + (duration + buffer) * 60000
  const deposit = Number(item.deposit_amount ?? 0)
  const needsPayment = deposit > 0

  const { data: order, error: orderErr } = await (admin.from('orders') as any)
    .insert({
      customer_id: user.id,
      provider_id: card.provider_id,
      service_id: values.service_id,
      service_item_id: values.service_item_id,
      // Poskytovatel souhlasil tím, že čas vypsal — nic dalšího neschvaluje.
      status: 'prijato',
      description: values.message?.trim() || null,
      total_price: item.price ?? null,
      deposit_amount: needsPayment ? deposit : null,
      deposit_status: needsPayment ? 'pending' : 'none',
      // Zámek jen na dobu placení. Bez zálohy není co držet.
      hold_expires_at: needsPayment
        ? new Date(Date.now() + HOLD_MINUTES * 60000).toISOString()
        : null,
      location_city: values.location_city?.trim() || null,
      service_location: atCustomer ? 'u_zakaznika' : 'u_poskytovatele',
      scheduled_at: start.toISOString(),
      scheduled_end: new Date(endMs).toISOString(),
    })
    .select('id')
    .single()

  if (orderErr || !order) {
    console.error('[reserveTime]', orderErr)
    return { success: false, error: 'Rezervaci se nepodařilo vytvořit.' }
  }

  // ── Souběh ─────────────────────────────────────────────────
  // Dva lidé mohli projít kontrolou ve stejnou vteřinu. Podíváme se, jestli
  // se nám s někým nepřekrývá termín — kdo byl dřív, ten platí.
  const { data: clash } = await admin
    .from('orders')
    .select('id, created_at, deposit_status, hold_expires_at')
    .eq('provider_id', card.provider_id)
    .neq('status', 'zruseno')
    .neq('id', order.id)
    .lt('scheduled_at', new Date(endMs).toISOString())
    .gt('scheduled_end', start.toISOString()) as { data: any[] | null }

  const live = (clash ?? []).filter((c) => {
    // Cizí rezervace s prošlým zámkem už termín nedrží.
    if (c.deposit_status === 'pending' && c.hold_expires_at) {
      return new Date(c.hold_expires_at).getTime() > Date.now()
    }
    return true
  })

  if (live.length > 0) {
    await admin.from('orders').delete().eq('id', order.id)
    return { success: false, error: 'Tento termín byl právě zabrán. Vyberte prosím jiný.' }
  }

  // ── Oznámení poskytovateli ─────────────────────────────────
  // U placené rezervace čekáme s oznámením na zaplacení (řeší webhook),
  // ať poskytovateli nechodí zprávy o rezervacích, které nikdo nedoplatí.
  if (!needsPayment) {
    try {
      await createNotification({
        userId: card.provider_id,
        type: 'status_change',
        orderId: order.id,
        actorId: user.id,
        title: 'Nová rezervace termínu',
        preview: item.name,
      })
    } catch (err) {
      console.error('[reserveTime] notifikace:', err)
    }
  }

  revalidatePath(`/sluzby/${values.service_id}`)
  revalidatePath('/dashboard/objednavky')
  revalidatePath('/dashboard/terminy')

  return { success: true, id: order.id, needsPayment }
}