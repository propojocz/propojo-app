// lib/actions/types.ts
// Sdílené typy pro Server Actions - BEZ 'use server'

export type ServiceCategory = 'remesla'|'instalaterstvi'|'elektrika'|'malirstvi'|'tesarstvi'|'zahradnictvi'|'uklid'|'it_sluzby'|'doprava'|'jine'
export type PriceUnit = 'hod'|'kus'|'den'|'projekt'
export type OrderStatus = 'cekajici'|'prijato'|'v_procesu'|'dokonceno'|'zruseno'

export type ServiceFormValues = {
  title: string
  description: string
  category: ServiceCategory
  price: number
  price_unit: PriceUnit
  city: string
  image_url?: string
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
