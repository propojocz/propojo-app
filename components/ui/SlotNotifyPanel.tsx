'use client'
// components/ui/SlotNotifyPanel.tsx
// „Komu dát vědět?" — objeví se hned po vytvoření volného okna, na tom samém místě.
// Poskytovatel zaškrtne publika, vidí u nich počty, odešle. Vedle toho sdílecí
// odkaz pro Instagram / WhatsApp, který funguje i pro lidi mimo Propojo.
//
// Počty se načítají ze serveru až po odfiltrování (kdo má upozornění vypnutá
// a kdo už zprávu na tenhle termín dostal), takže čísla nelžou.

import { useState, useEffect } from 'react'
import { Users, Star, Hourglass, Loader2, Send, CheckCircle2, X } from 'lucide-react'
import { getSlotAudienceCounts, notifySlotAudience, type Audience, type AudienceCounts } from '@/lib/actions/slot-notify'
import ShareSlotButton from '@/components/ui/ShareSlotButton'

interface Props {
  slotId: string
  /** Popisek termínu do sdílené zprávy — „pátek 25. 7. 14:00–16:00" */
  label?: string
  onClose?: () => void
}

export default function SlotNotifyPanel({ slotId, label, onClose }: Props) {
  const [counts, setCounts] = useState<AudienceCounts | null>(null)
  const [selected, setSelected] = useState<Audience[]>([])
  const [sending, setSending] = useState(false)
  const [sentCount, setSentCount] = useState<number | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    let cancelled = false
    getSlotAudienceCounts(slotId).then((c) => {
      if (cancelled) return
      setCounts(c)
      // Předzaškrtneme jen skupiny, kde někdo je — ať poskytovatel jen klikne Odeslat.
      const pre: Audience[] = []
      if (c.waitlist > 0) pre.push('waitlist')
      if (c.stali > 0) pre.push('stali')
      if (c.oblibene > 0) pre.push('oblibene')
      setSelected(pre)
    })
    return () => { cancelled = true }
  }, [slotId])

  const toggle = (a: Audience) =>
    setSelected((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]))

  const total = counts
    ? (selected.includes('stali') ? counts.stali : 0)
      + (selected.includes('oblibene') ? counts.oblibene : 0)
      + (selected.includes('waitlist') ? counts.waitlist : 0)
    : 0

  const send = async () => {
    setSending(true); setErr('')
    const res = await notifySlotAudience(slotId, selected)
    setSending(false)
    if (res.success) setSentCount(res.sent)
    else setErr(res.error)
  }

  const rows: { key: Audience; icon: any; title: string; desc: string; count: number }[] = counts ? [
    {
      key: 'waitlist', icon: Hourglass,
      title: 'Kdo čeká na termín',
      desc: 'Přihlásili se, že chtějí dát vědět',
      count: counts.waitlist,
    },
    {
      key: 'stali', icon: Users,
      title: 'Stálým zákazníkům',
      desc: 'Byli u vás a podle jejich zvyklostí je čas na další návštěvu',
      count: counts.stali,
    },
    {
      key: 'oblibene', icon: Star,
      title: 'Kdo si vás dal do oblíbených',
      desc: 'Sledují vás, ale zatím u vás nebyli',
      count: counts.oblibene,
    },
  ] : []

  return (
    <div className="rounded-2xl border-2 border-emerald-500 bg-white p-5 shadow-lg shadow-emerald-600/10">
      <div className="mb-1 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-black text-slate-900">Komu dát vědět?</h3>
          {label && <p className="mt-0.5 text-sm text-slate-500">{label}</p>}
        </div>
        {onClose && (
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Zavřít">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {sentCount !== null ? (
        <div className="mt-4 flex flex-col items-center gap-2 rounded-xl bg-emerald-50 p-5 text-center">
          <CheckCircle2 className="h-8 w-8 text-emerald-500" />
          <p className="font-bold text-emerald-800">
            Odesláno {sentCount} {sentCount === 1 ? 'člověku' : sentCount < 5 ? 'lidem' : 'lidem'}
          </p>
          <p className="text-xs leading-relaxed text-emerald-700">
            Termín patří tomu, kdo si ho vezme první. Až bude zabraný, uvidíte to v seznamu níže.
          </p>
        </div>
      ) : !counts ? (
        <div className="flex items-center gap-2 py-6 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Zjišťuji, koho můžete oslovit…
        </div>
      ) : (
        <>
          <div className="mt-4 space-y-2">
            {rows.map((r) => {
              const Icon = r.icon
              const isOn = selected.includes(r.key)
              const empty = r.count === 0
              return (
                <button
                  key={r.key}
                  type="button"
                  disabled={empty}
                  onClick={() => toggle(r.key)}
                  className={`flex w-full items-center gap-3 rounded-xl border-2 p-3 text-left transition-all ${
                    empty
                      ? 'cursor-not-allowed border-slate-100 bg-slate-50 opacity-60'
                      : isOn
                        ? 'border-emerald-500 bg-emerald-50'
                        : 'border-slate-200 bg-white hover:border-emerald-300'
                  }`}
                >
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 ${isOn && !empty ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300'}`}>
                    {isOn && !empty && <span className="text-[10px] leading-none">✓</span>}
                  </span>
                  <Icon className={`h-4 w-4 shrink-0 ${isOn && !empty ? 'text-emerald-600' : 'text-slate-400'}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-slate-900">{r.title}</span>
                    <span className="block text-xs leading-relaxed text-slate-500">
                      {empty ? 'Zatím nikdo' : r.desc}
                    </span>
                  </span>
                  <span className={`shrink-0 text-sm font-black ${empty ? 'text-slate-300' : 'text-slate-900'}`}>
                    {r.count}
                  </span>
                </button>
              )
            })}
          </div>

          {counts.alreadyNotified > 0 && (
            <p className="mt-2 text-xs text-slate-400">
              {counts.alreadyNotified} {counts.alreadyNotified === 1 ? 'člověk už zprávu dostal' : 'lidí už zprávu dostalo'} — těm se znovu neposílá.
            </p>
          )}

          {err && <p className="mt-3 text-sm text-red-600">{err}</p>}

          <button
            onClick={send}
            disabled={sending || total === 0}
            className="btn-primary mt-4 w-full justify-center disabled:opacity-50"
          >
            {sending
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Odesílám…</>
              : <><Send className="h-4 w-4" /> {total > 0 ? `Odeslat ${total} lidem` : 'Není komu odeslat'}</>}
          </button>
        </>
      )}

      {/* Sdílení funguje vždy — i pro lidi, kteří na Propojo zatím nejsou */}
      <div className="mt-4 border-t border-slate-100 pt-4">
        <ShareSlotButton slotId={slotId} label={label} />
      </div>
    </div>
  )
}