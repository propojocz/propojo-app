// lib/stripe.ts
// Stripe klient pro server (Server Actions, API routes, webhooky).
// Secret klíč se bere z .env.local (STRIPE_SECRET_KEY) – NIKDY ne do prohlížeče.
import Stripe from 'stripe'

const key = process.env.STRIPE_SECRET_KEY
if (!key) {
  // Jasná chyba při startu, když klíč chybí – ať se to nepozná až za běhu
  console.error('[stripe] Chybí STRIPE_SECRET_KEY v .env.local')
}

export const stripe = new Stripe(key ?? '', {
apiVersion: '2026-05-27.dahlia',
  typescript: true,
})