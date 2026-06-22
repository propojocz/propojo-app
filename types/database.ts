// types/database.ts
// Vygenerováno ze Supabase (npx supabase gen types) + ruční pomocné typy na konci.
// Při změně schématu znovu: npx supabase gen types typescript --project-id svtrlztjlxxjrbncukmp

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      categories: {
        Row: {
          color: string
          icon: string
          id: string
          name: string
          slug: string
          sort_order: number | null
        }
        Insert: {
          color?: string
          icon: string
          id?: string
          name: string
          slug: string
          sort_order?: number | null
        }
        Update: {
          color?: string
          icon?: string
          id?: string
          name?: string
          slug?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      commission_log: {
        Row: {
          commission_amount: number
          commission_pct: number
          created_at: string
          id: string
          order_id: string
          order_total: number
          plan_slug: string
          provider_id: string
        }
        Insert: {
          commission_amount: number
          commission_pct: number
          created_at?: string
          id?: string
          order_id: string
          order_total: number
          plan_slug: string
          provider_id: string
        }
        Update: {
          commission_amount?: number
          commission_pct?: number
          created_at?: string
          id?: string
          order_id?: string
          order_total?: number
          plan_slug?: string
          provider_id?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string
          created_at: string
          id: string
          image_url: string | null
          order_id: string
          read_at: string | null
          sender_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          image_url?: string | null
          order_id: string
          read_at?: string | null
          sender_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          image_url?: string | null
          order_id?: string
          read_at?: string | null
          sender_id?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          created_at: string
          customer_id: string
          description: string | null
          id: string
          provider_id: string
          service_id: string | null
          status: string
          total_price: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          description?: string | null
          id?: string
          provider_id: string
          service_id?: string | null
          status?: string
          total_price?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          description?: string | null
          id?: string
          provider_id?: string
          service_id?: string | null
          status?: string
          total_price?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      plans: {
        Row: {
          commission_pct: number
          created_at: string
          description: string | null
          has_account_manager: boolean
          has_b2b_access: boolean
          has_custom_url: boolean
          has_fakturoid_export: boolean
          has_insurance: boolean
          has_team_management: boolean
          has_verified_badge: boolean
          has_video: boolean
          id: string
          insurance_limit: number | null
          is_active: boolean
          max_active_jobs: number | null
          max_photos: number
          name: string
          price_monthly: number
          price_yearly: number
          priority_level: number
          slug: string
          sort_order: number
          trial_days: number
        }
        Insert: {
          commission_pct?: number
          created_at?: string
          description?: string | null
          has_account_manager?: boolean
          has_b2b_access?: boolean
          has_custom_url?: boolean
          has_fakturoid_export?: boolean
          has_insurance?: boolean
          has_team_management?: boolean
          has_verified_badge?: boolean
          has_video?: boolean
          id?: string
          insurance_limit?: number | null
          is_active?: boolean
          max_active_jobs?: number | null
          max_photos?: number
          name: string
          price_monthly?: number
          price_yearly?: number
          priority_level?: number
          slug: string
          sort_order?: number
          trial_days?: number
        }
        Update: {
          commission_pct?: number
          created_at?: string
          description?: string | null
          has_account_manager?: boolean
          has_b2b_access?: boolean
          has_custom_url?: boolean
          has_fakturoid_export?: boolean
          has_insurance?: boolean
          has_team_management?: boolean
          has_verified_badge?: boolean
          has_video?: boolean
          id?: string
          insurance_limit?: number | null
          is_active?: boolean
          max_active_jobs?: number | null
          max_photos?: number
          name?: string
          price_monthly?: number
          price_yearly?: number
          priority_level?: number
          slug?: string
          sort_order?: number
          trial_days?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          city: string | null
          company_name: string | null
          created_at: string
          full_name: string
          ico: string | null
          ico_verified: boolean | null
          id: string
          is_provider: boolean
          phone: string | null
          rating: number | null
          review_count: number | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          company_name?: string | null
          created_at?: string
          full_name: string
          ico?: string | null
          ico_verified?: boolean | null
          id: string
          is_provider?: boolean
          phone?: string | null
          rating?: number | null
          review_count?: number | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          company_name?: string | null
          created_at?: string
          full_name?: string
          ico?: string | null
          ico_verified?: boolean | null
          id?: string
          is_provider?: boolean
          phone?: string | null
          rating?: number | null
          review_count?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      referrals: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          referral_code: string
          referred_id: string
          referrer_id: string
          reward_granted: boolean
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          referral_code: string
          referred_id: string
          referrer_id: string
          reward_granted?: boolean
          status?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          referral_code?: string
          referred_id?: string
          referrer_id?: string
          reward_granted?: boolean
          status?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          order_id: string
          provider_id: string
          rating: number
          reviewer_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          order_id: string
          provider_id: string
          rating: number
          reviewer_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          order_id?: string
          provider_id?: string
          rating?: number
          reviewer_id?: string
        }
        Relationships: []
      }
      service_subcategories: {
        Row: {
          created_at: string
          service_id: string
          subcategory_id: string
        }
        Insert: {
          created_at?: string
          service_id: string
          subcategory_id: string
        }
        Update: {
          created_at?: string
          service_id?: string
          subcategory_id?: string
        }
        Relationships: []
      }
      service_types: {
        Row: {
          id: string
          name: string
          subcategory_id: string
        }
        Insert: {
          id?: string
          name: string
          subcategory_id: string
        }
        Update: {
          id?: string
          name?: string
          subcategory_id?: string
        }
        Relationships: []
      }
      services: {
        Row: {
          cancellation_policy: string
          category: string
          city: string
          created_at: string
          deposit_amount: number | null
          description: string
          duration_minutes: number | null
          free_km: number | null
          id: string
          image_url: string | null
          is_active: boolean
          payment_model: string
          price: number | null
          price_max: number | null
          price_per_km: number | null
          price_type: string
          price_unit: string
          provider_id: string
          quote_days: number | null
          quote_fee: number | null
          service_type: string | null
          subcategory_id: string | null
          title: string
          updated_at: string
          view_count: number | null
        }
        Insert: {
          cancellation_policy?: string
          category: string
          city: string
          created_at?: string
          deposit_amount?: number | null
          description: string
          duration_minutes?: number | null
          free_km?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          payment_model?: string
          price?: number | null
          price_max?: number | null
          price_per_km?: number | null
          price_type?: string
          price_unit?: string
          provider_id: string
          quote_days?: number | null
          quote_fee?: number | null
          service_type?: string | null
          subcategory_id?: string | null
          title: string
          updated_at?: string
          view_count?: number | null
        }
        Update: {
          cancellation_policy?: string
          category?: string
          city?: string
          created_at?: string
          deposit_amount?: number | null
          description?: string
          duration_minutes?: number | null
          free_km?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          payment_model?: string
          price?: number | null
          price_max?: number | null
          price_per_km?: number | null
          price_type?: string
          price_unit?: string
          provider_id?: string
          quote_days?: number | null
          quote_fee?: number | null
          service_type?: string | null
          subcategory_id?: string | null
          title?: string
          updated_at?: string
          view_count?: number | null
        }
        Relationships: []
      }
      subcategories: {
        Row: {
          category_id: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          category_id: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          category_id?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          billing_period: string
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string
          current_period_start: string
          id: string
          plan_id: string
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          trial_end: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          billing_period?: string
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end: string
          current_period_start?: string
          id?: string
          plan_id: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_end?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          billing_period?: string
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          id?: string
          plan_id?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_end?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_subcat: {
        Args: { cat_slug: string; sub_name: string }
        Returns: undefined
      }
      make_slug: { Args: { txt: string }; Returns: string }
      unaccent_simple: { Args: { txt: string }; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

// ============================================================
// POMOCNÉ TYPY (ručně udržované – navazují na typy výše)
// ============================================================

export type Profile = Database['public']['Tables']['profiles']['Row']
export type Service = Database['public']['Tables']['services']['Row']
export type Order = Database['public']['Tables']['orders']['Row']
export type Category = Database['public']['Tables']['categories']['Row']
export type Subcategory = Database['public']['Tables']['subcategories']['Row']
export type Review = Database['public']['Tables']['reviews']['Row']
export type Plan = Database['public']['Tables']['plans']['Row']
export type Subscription = Database['public']['Tables']['subscriptions']['Row']
export type Message = Database['public']['Tables']['messages']['Row']

export type ServiceInsert = Database['public']['Tables']['services']['Insert']
export type ProfileInsert = Database['public']['Tables']['profiles']['Insert']
export type OrderInsert = Database['public']['Tables']['orders']['Insert']

// Stavy objednávky (česky – používá je dashboard)
export type OrderStatus =
  | 'cekajici'
  | 'prijato'
  | 'v_procesu'
  | 'dokonceno'
  | 'zruseno'

// Kategorie – v DB je to volný text (slug)
export type ServiceCategory = string

// Rozšířený typ: služba + profil poskytovatele (joined dotaz)
export type ServiceWithProvider = Service & {
  profiles: Pick<Profile, 'id' | 'full_name' | 'avatar_url' | 'rating' | 'review_count' | 'city'>
}

// Fallback metadata kategorií pro UI (emoji/label).
// Aktuální kategorie/ikony se načítají z tabulky `categories` v DB;
// tohle slouží jen jako fallback v komponentách, které CATEGORY_META používají.
export const CATEGORY_META: Record<string, { label: string; emoji: string; image: string }> = {
  remesla:        { label: 'Řemesla',         emoji: '🔨', image: '/categories/crafts.jpg' },
  instalaterstvi: { label: 'Instalatérství',  emoji: '🔧', image: '/categories/plumbing.jpg' },
  elektrika:      { label: 'Elektrikáři',     emoji: '⚡', image: '/categories/electric.jpg' },
  malirstvi:      { label: 'Malíři',          emoji: '🖌️', image: '/categories/painting.jpg' },
  tesarstvi:      { label: 'Tesaři',          emoji: '🪵', image: '/categories/carpentry.jpg' },
  zahradnictvi:   { label: 'Zahradnictví',    emoji: '🌿', image: '/categories/garden.jpg' },
  uklid:          { label: 'Úklid',           emoji: '🧹', image: '/categories/cleaning.jpg' },
  it_sluzby:      { label: 'IT služby',       emoji: '💻', image: '/categories/it.jpg' },
  doprava:        { label: 'Doprava',         emoji: '🚛', image: '/categories/transport.jpg' },
  jine:           { label: 'Jiné',            emoji: '📦', image: '/categories/other.jpg' },
}