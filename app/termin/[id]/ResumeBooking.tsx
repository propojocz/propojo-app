'use client'
// app/termin/[id]/ResumeBooking.tsx
// Zákazník má na tomto termínu rozpracovanou rezervaci (termín je pro něj držený, ještě nezaplaceno):
// „Shrnutí a platba“ se otevře rovnou, bez dalšího klikání. Po zavření zůstane tlačítko pro návrat.

import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import BookingWizard from '@/components/ui/BookingWizard'

export default function ResumeBooking({ orderId }: { orderId: string }) {
  const [open, setOpen] = useState(true)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 font-bold text-white transition hover:bg-emerald-600"
      >
        Pokračovat k dokončení <ArrowRight className="h-4 w-4" />
      </button>
      {open && <BookingWizard orderId={orderId} onClose={() => setOpen(false)} />}
    </>
  )
}
