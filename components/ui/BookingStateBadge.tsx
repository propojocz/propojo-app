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

function texty(state: string, isProvider: boolean, deadline: string | null): { tone: Tone; title: string; text: string } | null {
  switch (state) {
    case 'pending_payment':
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
          ? `Platba je předautorizovaná. Potvrďte rezervaci${deadline ? ` nejpozději ${deadline}` : ''}, jinak se platba uvolní. Zatím můžete potvrdit stržením platby ve svém Stripe Dashboardu.`
          : `Platba je předautorizovaná, zatím nic nebylo strženo. Poskytovatel má na potvrzení čas${deadline ? ` do ${deadline}` : ''}.`,
      }
    case 'capture_in_progress':
      return { tone: 'wait', title: 'Potvrzování probíhá', text: 'Platba se právě strhává. Stav se za chvíli aktualizuje.' }
    case 'confirmed':
      return {
        tone: 'ok',
        title: 'Rezervace je potvrzená',
        text: isProvider ? 'Platba byla stržena na váš Stripe účet.' : 'Poskytovatel rezervaci potvrdil a platba byla stržena.',
      }
    case 'payment_expired':
      return { tone: 'off', title: 'Platba vypršela', text: 'Platba nebyla dokončena, nic nebylo strženo.' }
    case 'declined':
      return { tone: 'off', title: 'Rezervace nebyla potvrzena', text: 'Poskytovatel rezervaci nepotvrdil. Platba byla uvolněna, peníze nebyly strženy.' }
    case 'expired':
      return { tone: 'off', title: 'Rezervace nebyla včas potvrzena', text: 'Platba byla uvolněna, peníze nebyly strženy.' }
    case 'capture_failed':
      return { tone: 'warn', title: 'Platbu se nepodařilo strhnout', text: 'Rezervace není potvrzená.' }
    case 'cancelled':
      return { tone: 'off', title: 'Rezervace zrušena', text: 'Stav případného vrácení peněz uvidíte zde, jakmile ho Stripe zpracuje.' }
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
}: {
  state: string | null
  isProvider: boolean
  confirmDeadlineAt: string | null
}) {
  if (!state) return null
  const t = texty(state, isProvider, confirmDeadlineAt ? datumCas(confirmDeadlineAt) : null)
  if (!t) return null
  const tone = TONE[t.tone]
  const Icon = t.tone === 'ok' ? CheckCircle2 : t.tone === 'warn' ? AlertTriangle : t.tone === 'off' ? XCircle : state === 'pending_payment' ? CreditCard : Clock

  return (
    <div className={`flex items-start gap-3 rounded-2xl border p-4 ${tone.box}`}>
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${tone.icon}`} />
      <div>
        <p className="font-bold text-slate-900">{t.title}</p>
        <p className="mt-0.5 text-sm text-slate-600">{t.text}</p>
      </div>
    </div>
  )
}
