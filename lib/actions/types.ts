// lib/actions/types.ts
// Sdílené typy pro Server Actions - BEZ 'use server'
//
// Číselníky (PriceUnit, PaymentModel, PriceType) se importují z types/database.ts,
// aby existovala JEN JEDNA definice.

import type {
  PaymentModel,
  PriceType,
  PriceUnit,
  ServiceCategory,
  LocationType,
} from '@/types/database'

export type { PaymentModel, PriceType, PriceUnit, ServiceCategory, LocationType }

export type OrderStatus = 'cekajici'|'prijato'|'v_procesu'|'dokonceno'|'zruseno'

export type ServiceFormValues = {
  title: string
  subtitle?: string | null
  description: string
  category: ServiceCategory
  subcategory_id?: string
  subcategory_ids?: string[]
  service_type?: string
  phone?: string | null
  city: string
  city_lat?: number | null
  city_lng?: number | null
  image_url?: string
  gallery?: string[]
  // Kde se služba vykonává
  location_type?: LocationType
  address?: string | null
  address_lat?: number | null
  address_lng?: number | null
  address_public?: boolean
  radius_km?: number | null
  // ── Cenová pole (LEGACY) — po přestavbě je nese ceník (service_items). ──
  price?: number
  price_unit?: PriceUnit
  price_includes_material?: boolean
  price_note?: string | null
  payment_model?: PaymentModel
  price_type?: PriceType
  price_max?: number | null
  deposit_amount?: number | null
  duration_minutes?: number | null
  quote_fee?: number | null
  price_per_km?: number | null
  free_km?: number | null
  quote_days?: number | null
  cancellation_policy?: 'zadna'|'mirna'|'standardni'|'prisna'
}

// Hodnoty jedné položky ceníku, jak je posílá editor do server action.
export type ServiceItemFormValues = {
  id?: string
  service_id: string
  service_type_id?: string | null
  name: string
  payment_model: PaymentModel
  price_type: PriceType
  price?: number | null
  price_unit: PriceUnit
  price_max?: number | null
  duration_minutes?: number | null
  deposit_amount?: number | null
  price_includes_material?: boolean
  price_note?: string | null
  is_active?: boolean
  sort_order?: number
}

export type ActionResult =
  | { success: true; id: string }
  | { success: false; error: string; fieldErrors?: Record<string, string[]>; hasOrders?: boolean }

export type AuthResult =
  | { success: true }
  | { success: false; error: string }

export type ReviewFormValues = {
  order_id: string
  provider_id: string
  rating: number
  comment?: string
}