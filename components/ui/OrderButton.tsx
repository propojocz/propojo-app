'use client'
// components/ui/OrderButton.tsx

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, Loader2, MessageSquare, LogIn } from 'lucide-react'
import Link from 'next/link'
import { createOrder } from '@/lib/actions/orders'

interface OrderButtonProps {
  serviceId: string
  providerId: string
  isLoggedIn: boolean
  priceAgreed?: number
  paymentModel?: string | null
}

export default function OrderButton({ serviceId, providerId, isLoggedIn, priceAgreed, paymentModel }: OrderButtonProps) {
  const [state, setState] = useState<'idle' | 'form' | 'loading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const isModelB = paymentModel === 'B'
  // Jasný text podle modelu (místo vágního "Mám zájem")
  const ctaLabel = isModelB ? 'Poptat a domluvit cenu' : 'Mám zájem o termín'

  if (!isLoggedIn) {
    return (
      <Link href={`/prihlasit?next=/sluzby/${serviceId}`} className="btn-primary w-full">
        <LogIn className="h-4 w-4" />
        Přihlásit a objednat
      </Link>
    )
  }

  const handleOrder = async () => {
    setState('loading')
    const result = await createOrder({
      service_id: serviceId,
      provider_id: providerId,
      message: message || undefined,
      price_agreed: priceAgreed,
    })

    if (result.success) {
      setState('success')
    } else {
      setState('error')
      setErrorMsg(result.error)
    }
  }

  if (state === 'success') {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center gap-2 rounded-xl bg-emerald-50 p-4 text-center"
      >
        <CheckCircle2 className="h-8 w-8 text-emerald-500" />
        <p className="font-bold text-emerald-800">Poptávka odeslána!</p>
        <p className="text-xs text-emerald-700">Živnostník vás brzy zkontaktuje.</p>
      </motion.div>
    )
  }

  return (
    <div className="space-y-3">
      <AnimatePresence>
        {state === 'form' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={isModelB ? 'Popište práci, kterou potřebujete nacenit…' : 'Zpráva pro živnostníka (volitelné)…'}
              rows={3}
              className="form-input resize-none text-sm"
              maxLength={500}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {state === 'error' && (
        <p className="text-xs text-red-600">{errorMsg}</p>
      )}

      {state === 'idle' && (
        <button
          onClick={() => setState('form')}
          className="btn-primary w-full"
        >
          <MessageSquare className="h-4 w-4" />
          {ctaLabel}
        </button>
      )}

      {state === 'form' && (
        <div className="flex gap-2">
          <button
            onClick={() => setState('idle')}
            className="btn-secondary flex-1"
          >
            Zrušit
          </button>
          <button
            onClick={handleOrder}
            className="btn-primary flex-1"
          >
            Odeslat poptávku
          </button>
        </div>
      )}

      {state === 'loading' && (
        <button disabled className="btn-primary w-full opacity-75">
          <Loader2 className="h-4 w-4 animate-spin" />
          Odesílám…
        </button>
      )}
    </div>
  )
}