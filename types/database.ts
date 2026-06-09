// types/database.ts
// Generováno ručně – přesně odpovídá schema.sql

export type ServiceCategory =
  | 'remesla'
  | 'instalaterstvi'
  | 'elektrika'
  | 'malirstvi'
  | 'tesarstvi'
  | 'zahradnictvi'
  | 'uklid'
  | 'it_sluzby'
  | 'doprava'
  | 'jine'

export type OrderStatus =
  | 'cekajici'
  | 'prijato'
  | 'v_procesu'
  | 'dokonceno'
  | 'zruseno'

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          full_name: string
          avatar_url: string | null
          phone: string | null
          city: string | null
          bio: string | null
          is_provider: boolean
          rating: number | null
          review_count: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          full_name: string
          avatar_url?: string | null
          phone?: string | null
          city?: string | null
          bio?: string | null
          is_provider?: boolean
          rating?: number | null
          review_count?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          full_name?: string
          avatar_url?: string | null
          phone?: string | null
          city?: string | null
          bio?: string | null
          is_provider?: boolean
          rating?: number | null
          review_count?: number
          updated_at?: string
        }
      }
      services: {
        Row: {
          id: string
          provider_id: string
          title: string
          description: string
          category: ServiceCategory
          price: number
          price_unit: string
          city: string
          is_active: boolean
          image_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          provider_id: string
          title: string
          description: string
          category: ServiceCategory
          price: number
          price_unit?: string
          city: string
          is_active?: boolean
          image_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          provider_id?: string
          title?: string
          description?: string
          category?: ServiceCategory
          price?: number
          price_unit?: string
          city?: string
          is_active?: boolean
          image_url?: string | null
          updated_at?: string
        }
      }
      orders: {
        Row: {
          id: string
          service_id: string
          client_id: string
          provider_id: string
          status: OrderStatus
          message: string | null
          scheduled_at: string | null
          price_agreed: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          service_id: string
          client_id: string
          provider_id: string
          status?: OrderStatus
          message?: string | null
          scheduled_at?: string | null
          price_agreed?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          service_id?: string
          client_id?: string
          provider_id?: string
          status?: OrderStatus
          message?: string | null
          scheduled_at?: string | null
          price_agreed?: number | null
          updated_at?: string
        }
      }
    }
    Enums: {
      service_category: ServiceCategory
      order_status: OrderStatus
    }
  }
}

// Pomocné typy pro pohodlnější práci
export type Profile = Database['public']['Tables']['profiles']['Row']
export type Service = Database['public']['Tables']['services']['Row']
export type Order = Database['public']['Tables']['orders']['Row']

export type ServiceInsert = Database['public']['Tables']['services']['Insert']
export type ProfileInsert = Database['public']['Tables']['profiles']['Insert']
export type OrderInsert = Database['public']['Tables']['orders']['Insert']

// Rozšířený typ pro service s profilem poskytovatele
export type ServiceWithProvider = Service & {
  profiles: Pick<Profile, 'id' | 'full_name' | 'avatar_url' | 'rating' | 'review_count' | 'city'>
}

// Metadata kategorií pro UI
export const CATEGORY_META: Record<ServiceCategory, { label: string; emoji: string; image: string }> = {
  remesla:       { label: 'Řemesla',         emoji: '🔨', image: '/categories/crafts.jpg' },
  instalaterstvi:{ label: 'Instalatérství',  emoji: '🔧', image: '/categories/plumbing.jpg' },
  elektrika:     { label: 'Elektrikáři',     emoji: '⚡', image: '/categories/electric.jpg' },
  malirstvi:     { label: 'Malíři',          emoji: '🖌️', image: '/categories/painting.jpg' },
  tesarstvi:     { label: 'Tesaři',          emoji: '🪵', image: '/categories/carpentry.jpg' },
  zahradnictvi:  { label: 'Zahradnictví',    emoji: '🌿', image: '/categories/garden.jpg' },
  uklid:         { label: 'Úklid',           emoji: '🧹', image: '/categories/cleaning.jpg' },
  it_sluzby:     { label: 'IT služby',       emoji: '💻', image: '/categories/it.jpg' },
  doprava:       { label: 'Doprava',         emoji: '🚛', image: '/categories/transport.jpg' },
  jine:          { label: 'Jiné',            emoji: '📦', image: '/categories/other.jpg' },
}

export const CATEGORIES = Object.keys(CATEGORY_META) as ServiceCategory[]
