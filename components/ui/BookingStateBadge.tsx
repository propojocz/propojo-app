// components/ui/BookingStateBadge.tsx
// Model v2: stav rezervace s platbou (orders.booking_state) v detailu objednávky.
// Jen pro čtení – akce (potvrdit, odmítnout, zrušit) přijdou s vrstvou 3.
// Nikde neříká „potvrzeno“ dřív, než proběhne capture.

import { Clock, CheckCircle2, XCircle, AlertTriangle, CreditCard } from 'lucide-react'
import { datumCas } from '@/lib/format'

type Tone = 'wait' | 'ok' | 'off' | 'warn'

const TONE: Record<Tone, { box: string; icon: string }> = {
  wait: { box: 'border-amber-200 bg-amber-50', icon: 'text-amber-600' },
  ok: { box: 'border-emerald-200 bg-emerald-50', icon: 'text-emerald-600' },
  off: { box: 'border-slate-200 bg-slate-50', icon: 'text-slate-500' },
  warn: { box: 'border-rose-200 bg-rose-50', icon: 'text-rose-600' },
}

function texty(
  state: string,
  isProvider: boolean,
  deadline: string | null,
  paymentReturned: boolean,
  f: { authorized: boolean; captured: boolean; cancelReason: string | null },
): { tone: Tone; title: string; text: string } | null {
  switch (state) {
    case 'pending_payment':
      // Zákazník se vrátil ze Stripe, ale potvrzení platby (webhook) ještě nedorazilo.
      if (paymentReturned && !isProvider) {
        return {
          tone: 'wait',
          title: 'Platba se zpracovává',
          text: 'Platbu jsme od Stripe zatím nedostali potvrzenou. Obvykle to trvá pár sekund, stránka se obnoví sama. Nic dalšího neplaťte.',
        }
      }
      return {
        tone: 'wait',
        title: 'Čeká na platbu',
        text: isProvider
          ? 'Zákazník dokončuje platbu. O rezervaci vám dáme vědět, jakmile bude platba předautorizovaná.'
          : 'Dokončete prosím platbu. Částka se na kartě jen zablokuje, strhne se až po potvrzení poskytovatelem.',
      }
    case 'awaiting_confirmation':
      return {
        tone: 'wait',
        title: isProvider ? 'Rezervace čeká na vaše potvrzení' : 'Čekáme na potvrzení poskytovatele',
        text: isProvider
          ? 'Platba je předautorizovaná. Rezervaci potvrďte nebo odmítněte níže.'
          : `Platba je předautorizovaná, zatím nic nebylo strženo. Poskytovatel má na potvrzení čas${deadline ? ` do ${deadline}` : ''}.`,
      }
    case 'capture_in_progress':
      return { tone: 'wait', title: 'Potvrzování probíhá', text: 'Platba se právě strhává. Stav se za chvíli aktualizuje.' }
    case 'confirmed':
      return {
        tone: 'ok',
        title: isProvider ? '🎉 Máte nový potvrzený termín' : '🎉 Hotovo, termín je potvrzený',
        text: isProvider
          ? 'Zákazník zaplatil, peníze jsou na vašem Stripe účtu. Den předem vám oběma pošleme připomínku.'
          : 'Platba proběhla. Den předem vám pošleme připomínku – termín si můžete přidat do kalendáře (ikona kalendáře nahoře).',
      }
    case 'payment_expired':
      return { tone: 'off', title: 'Platba vypršela', text: 'Platba nebyla dokončena, nic nebylo strženo.' }
    case 'declined':
      // Odmítnuto před platbou (nic nebylo předautorizováno) / po předautorizaci (blokace uvolněna).
      if (!f.authorized) {
        return isProvider
          ? { tone: 'off', title: 'Objednávku jste zrušili', text: 'Zákazník platbu nedokončil, nic nebylo strženo.' }
          : { tone: 'off', title: 'Poskytovatel objednávku zrušil', text: 'Nic vám nebylo strženo.' }
      }
      return isProvider
        ? { tone: 'off', title: 'Rezervaci jste odmítli', text: 'Zákazníkovi se uvolnila blokace na kartě, nic nebylo strženo.' }
        : { tone: 'off', title: 'Rezervace nebyla potvrzena', text: 'Poskytovatel rezervaci nepotvrdil. Nic nebylo strženo, blokace na kartě se uvolnila. Banka ji může ještě pár dní ukazovat jako čekající platbu.' }
    case 'expired':
      return isProvider
        ? { tone: 'off', title: 'Rezervace propadla', text: 'Nepotvrdili jste ji včas. Zákazníkovi se uvolnila blokace na kartě, termín je znovu volný.' }
        : { tone: 'off', title: 'Rezervace nebyla včas potvrzena', text: 'Nic nebylo strženo, blokace na kartě se uvolnila. Banka ji může ještě pár dní ukazovat jako čekající platbu.' }
    case 'capture_failed':
      return { tone: 'warn', title: 'Platbu se nepodařilo strhnout', text: 'Rezervace není potvrzená.' }
    case 'cancelled':
      // Před stržením platby se nic nevrací – jen se uvolnila blokace / platba nedoběhla.
      if (!f.captured) {
        const byCustomer = f.cancelReason === 'customer_cancelled'
        return isProvider
          ? { tone: 'off', title: byCustomer ? 'Zákazník rezervaci zrušil' : 'Rezervace zrušena', text: 'Rezervace nebyla potvrzena, nic nebylo strženo.' }
          : { tone: 'off', title: byCustomer ? 'Rezervaci jste zrušili' : 'Rezervace zrušena', text: 'Nic vám nebylo strženo, blokace na kartě se uvolnila. Banka ji může ještě pár dní ukazovat jako čekající platbu.' }
      }
      return isProvider
        ? { tone: 'off', title: 'Rezervace zrušena', text: 'Platba byla stržena. Stav vrácení peněz zákazníkovi sledujeme ve Stripe a uvidíte ho zde.' }
        : { tone: 'off', title: 'Rezervace zrušena', text: 'Stav vrácení peněz uvidíte zde, jakmile ho Stripe zpracuje.' }
    case 'no_show_reported':
      return { tone: 'warn', title: 'Nahlášeno nedostavení', text: 'Čeká se na vyjádření poskytovatele.' }
    case 'no_show_disputed':
      return { tone: 'warn', title: 'Nedostavení je rozporováno', text: 'Peníze se automaticky nepohybují.' }
    default:
      return null
  }
}

export default function BookingStateBadge({
  state,
  isProvider,
  confirmDeadlineAt,
  paymentReturned = false,
  authorizedAt = null,
  confirmedAt = null,
  cancelReason = null,
}: {
  state: string | null
  isProvider: boolean
  confirmDeadlineAt: string | null
  /** Zákazník se právě vrátil ze Stripe (?platba=uspech) */
  paymentReturned?: boolean
  /** Kdy proběhla předautorizace (null = platba nedoběhla) */
  authorizedAt?: string | null
  /** Kdy se platba strhla (null = nic strženo) */
  confirmedAt?: string | null
  cancelReason?: string | null
}) {
  if (!state) return null
  const t = texty(state, isProvider, confirmDeadlineAt ? datumCas(confirmDeadlineAt) : null, paymentReturned, {
    authorized: !!authorizedAt,
    captured: !!confirmedAt,
    cancelReason,
  })
  if (!t) return null
  const tone = TONE[t.tone]
  const Icon = t.tone === 'ok' ? CheckCircle2 : t.tone === 'warn' ? AlertTriangle : t.tone === 'off' ? XCircle : state === 'pending_payment' ? CreditCard : Clock

  return (
    <div className={`flex items-start gap-3 rounded-2xl border p-4 ${tone.box}`}>
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${tone.icon}`} />
      <div>
        <p className="font-black text-slate-900">{t.title}</p>
        <p className="mt-0.5 text-sm text-slate-600">{t.text}</p>
      </div>
    </div>
  )
}
