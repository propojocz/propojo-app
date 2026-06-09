'use client'
// app/dashboard/objednavky/ReviewModal.tsx

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Star, X } from 'lucide-react'
import ReviewForm from '@/components/ui/ReviewForm'

interface ReviewModalProps {
  orderId: string
  providerId: string
  providerName: string
  serviceTitle: string
}

export default function ReviewModal({ orderId, providerId, providerName, serviceTitle }: ReviewModalProps) {
  const [open, setOpen] = useState(false)
  const [done, setDone] = useState(false)

  if (done) {
    return (
      <div className="flex items-center gap-2 text-sm text-emerald-600">
        <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
        Ohodnoceno – děkujeme!
      </div>
    )
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-700 transition-all hover:bg-amber-100"
      >
        <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
        Ohodnotit živnostníka
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
            onClick={(e) => e.target === e.currentTarget && setOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
            >
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-lg font-black text-slate-900">Ohodnoťte službu</h2>
                <button onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <ReviewForm
                orderId={orderId}
                providerId={providerId}
                providerName={providerName}
                serviceTitle={serviceTitle}
                onSuccess={() => { setDone(true); setOpen(false) }}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
