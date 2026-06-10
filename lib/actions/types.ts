// lib/actions/types.ts
// Sdílené typy pro Server Actions - BEZ 'use server'

export type ServiceCategory = 'remesla'|'instalaterstvi'|'elektrika'|'malirstvi'|'tesarstvi'|'zahradnictvi'|'uklid'|'it_sluzby'|'doprava'|'jine'
export type PriceUnit = 'hod'|'kus'|'den'|'projekt'
export type OrderStatus = 'cekajici'|'prijato'|'v_procesu'|'dokonceno'|'zruseno'

export type PaymentModel = 'A'|'B'
export type PriceType = 'fixed'|'range'|'on_agreement'

export type ServiceFormValues = {
  title: string
  description: string
  category: ServiceCategory
  price: number
  price_unit: PriceUnit
  city: string
  image_url?: string
// Více podkategorií (zaškrtávací)
  subcategory_ids?: string[]
  // Model A/B
  payment_model: PaymentModel
  price_type: PriceType
  price_max?: number | null
  deposit_amount?: number | null
  duration_minutes?: number | null
  quote_fee?: number | null
  price_per_km?: number | null
  free_km?: number | null
  quote_days?: number | null
}

export type ActionResult =
  | { success: true; id: string }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> }

export type AuthResult =
  | { success: true }
  | { success: false; error: string }

export type ReviewFormValues = {
  order_id: string
  provider_id: string
  rating: number
  comment?: string
}