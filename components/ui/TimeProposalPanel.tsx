'use client'
// components/ui/TimeProposalPanel.tsx
// Panel s návrhem termínů na detailu objednávky. Jedna komponenta, dva pohledy:
//
//  POSKYTOVATEL — u poptávky bez termínu navrhne 1–6 časů. Tři nejbližší volné
//  se předvyplní z jeho dostupnosti (otevírací doba mínus obsazené a blokace),
//  takže obvykle stačí kliknout na Odeslat. Vidí i preferenci zákazníka
//  (od–do + denní doba), pokud ji zákazník vyplnil nad chatem.
//
//  ZÁKAZNÍK — vidí navržené časy jako tlačítka s cenou. Klik = přijetí a rovnou
//  platba zálohy, tím je termín potvrzený. Nebo odmítne a domluví se v chatu.
//
// Návrhy se nedrží — termín zabere až zaplacení.

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarDays, Loader2, Plus, X, Send, Check, Clock, Sparkles, CalendarRange } from 'lucide-react'
import {
  suggestTimes, proposeTimes, acceptProposal, declineProposals, type Proposal,
} from '@/lib/actions/time-proposals'
import { createDepositCheckout } from '@/lib/actions/deposit'

interface Props {
  orderId: string
  isProvider: boolean
  /** Aktuální návrhy (načtené na serveru). */
  proposals: Proposal[]
  /** Kolik zákazník zaplatí při přijetí. 0 = bez zálohy, potvrdí se hned. */
  depositAmount: number
  /** Název úkonu do hlavičky panelu. */
  itemName?: string | null
  /** Jméno zákazníka do nadpisu (1. pád, neskloňujeme). */
  customerName?: string | null
  /** Preference zákazníka (od–do + denní doba) — jen pro poskytovatele. */
  prefFrom?: string | null
  prefTo?: string | null
  prefTime?: string | null
}

const fmtLong = (iso: string) =>
  new Intl.DateTimeFormat('cs-CZ', {
    weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))

const fmtDay = (iso: string) =>
  new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric' }).format(new Date(iso))

const TIME_LABELS: Record<string, string> = {
  rano: 'ráno (8–12)', odpoledne: 'odpoledne (12–17)', vecer: 'večer (17–20)', kdykoli: 'kdykoli',
}

// Hodnota pro <input type="datetime-local"> v místním čase.
function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16)
}

export default function TimeProposalPanel({
  orderId, isProvider, proposals, depositAmount, itemName, customerName,
  prefFrom, prefTo, prefTime,
}: Props) {
  const router = useRouter()
  const [draft, setDraft] = useState<string[]>([])      // ISO časy k odeslání
  const [newTime, setNewTime] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [loadingHint, setLoadingHint] = useState(isProvider && proposals.length === 0)
  // Poskytovatel klikl „Navrhnout jiné termíny" → editujeme nový návrh, i když
  // nějaké návrhy už existují (jinak by panel dál ukazoval jen hotové).
  const [editMode, setEditMode] = useState(false)

  // Předvyplnění z dostupnosti — jen když ještě nic nenavrhl.
  useEffect(() => {
    if (!isProvider || proposals.length > 0) return
    let cancelled = false
    suggestTimes(orderId)
      .then((times) => {
        if (cancelled) return
        setDraft(times.map((t) => t.start))
        setLoadingHint(false)
      })
      .catch(() => { if (!cancelled) setLoadingHint(false) })
    return () => { cancelled = true }
  }, [orderId, isProvider, proposals.length])

  // ── POSKYTOVATEL ─────────────────────────────────────────
  if (isProvider) {
    const addTime = () => {
      if (!newTime) return
      const iso = new Date(newTime).toISOString()
      if (draft.includes(iso)) { setNewTime(''); return }
      if (draft.length >= 6) { setError('Víc než šest termínů nemá smysl — vyberte ty nejlepší.'); return }
      setDraft((prev) => [...prev, iso].sort())
      setNewTime('')
      setError('')
    }

    const send = async () => {
      setBusy(true); setError('')
      const res = await proposeTimes(orderId, draft)
      setBusy(false)
      if (!res.success) { setError(res.error); return }
      setEditMode(false)
      router.refresh()
    }

    const hasPref = !!(prefFrom && prefTo)

    return (
      <div className="rounded-2xl border-2 border-amber-300 bg-amber-50/60 p-5">
        <div className="mb-1 flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-amber-600" />
          <h2 className="font-black text-slate-900">
            {proposals.length > 0 ? 'Navržené termíny' : 'Navrhněte termín'}
            {!proposals.length && customerName ? <span className="font-normal text-slate-500"> pro: {customerName}</span> : null}
          </h2>
        </div>

        {/* Preference zákazníka — kdy se mu to hodí */}
        {hasPref && proposals.length === 0 && (
          <div className="mb-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm text-slate-700">
            <CalendarRange className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <span>
              Zákazníkovi se hodí <strong>{fmtDay(prefFrom!)} – {fmtDay(prefTo!)}</strong>
              {prefTime ? <>, <strong>{TIME_LABELS[prefTime] ?? prefTime}</strong></> : null}.
            </span>
          </div>
        )}

        {proposals.length > 0 && !editMode ? (
          <>
            <p className="mb-3 text-sm text-slate-600">
              Zákazník si vybírá z těchto časů. Dokud jeden nepřijme a nezaplatí, termín se nikomu nedrží.
            </p>
            <div className="flex flex-wrap gap-2">
              {proposals.map((p) => (
                <span key={p.id} className="rounded-xl border border-amber-300 bg-white px-3 py-2 text-sm font-bold text-slate-800">
                  {fmtLong(p.starts_at)}
                </span>
              ))}
            </div>
            <button
              type="button"
              onClick={() => { setDraft(proposals.map((p) => p.starts_at)); setEditMode(true) }}
              className="mt-3 text-xs font-semibold text-slate-500 hover:text-slate-700"
            >
              Navrhnout jiné termíny
            </button>
          </>
        ) : (
          <>
            <p className="mb-3 text-sm leading-relaxed text-slate-600">
              {itemName ? <><strong>{itemName}</strong> — n</> : 'N'}abídněte zákazníkovi konkrétní časy.
              Vybere si jeden a zaplacením zálohy ho potvrdí.
            </p>

            {loadingHint && (
              <p className="mb-2 flex items-center gap-1.5 text-xs text-slate-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Hledám ve vašem rozvrhu volné časy…
              </p>
            )}

            {draft.length > 0 && (
              <>
                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-amber-700">
                  <Sparkles className="h-3.5 w-3.5" /> Předvyplněno z vaší dostupnosti — nekoliduje s ničím
                </p>
                <div className="flex flex-wrap gap-2">
                  {draft.map((iso) => (
                    <span key={iso} className="inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800">
                      {fmtLong(iso)}
                      <button
                        type="button"
                        onClick={() => setDraft((prev) => prev.filter((x) => x !== iso))}
                        aria-label="Odebrat termín"
                        className="rounded p-0.5 text-amber-400 hover:bg-amber-50 hover:text-amber-600"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              </>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                type="datetime-local"
                value={newTime}
                onChange={(e) => setNewTime(e.target.value)}
                min={toLocalInput(new Date().toISOString())}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400"
              />
              <button
                type="button"
                onClick={addTime}
                disabled={!newTime}
                className="inline-flex items-center gap-1 rounded-xl border border-dashed border-amber-400 px-3 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" /> Přidat čas
              </button>
            </div>

            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

            <button
              type="button"
              onClick={send}
              disabled={busy || draft.length === 0}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3 font-bold text-white transition hover:bg-amber-600 disabled:opacity-60"
            >
              {busy
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Odesílám…</>
                : <><Send className="h-4 w-4" /> Odeslat návrh ({draft.length === 1 ? '1 termín' : draft.length < 5 ? `${draft.length} termíny` : `${draft.length} termínů`})</>}
            </button>
          </>
        )}
      </div>
    )
  }

  // ── ZÁKAZNÍK ─────────────────────────────────────────────
  if (proposals.length === 0) return null

  const accept = async (start: string) => {
    setBusy(true); setError('')
    const res = await acceptProposal(orderId, start)
    if (!res.success) { setError(res.error); setBusy(false); router.refresh(); return }

    if (!res.needsPayment) {
      router.refresh()
      setBusy(false)
      return
    }

    const pay = await createDepositCheckout(orderId)
    if (pay.success) {
      window.location.href = pay.url
    } else {
      setError(pay.error)
      setBusy(false)
      router.refresh()
    }
  }

  const decline = async () => {
    if (!confirm('Odmítnout všechny navržené termíny? Poskytovatel se pokusí nabídnout jiné.')) return
    setBusy(true); setError('')
    const res = await declineProposals(orderId)
    setBusy(false)
    if (!res.success) { setError(res.error); return }
    router.refresh()
  }

  return (
    <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50/70 p-5">
      <div className="mb-1 flex items-center gap-2">
        <CalendarDays className="h-5 w-5 text-emerald-600" />
        <h2 className="font-black text-slate-900">Vyberte si termín</h2>
      </div>
      <p className="mb-3 text-sm leading-relaxed text-slate-600">
        Poskytovatel vám nabídl tyhle časy.
        {depositAmount > 0
          ? ` Kliknutím termín potvrdíte a zaplatíte zálohu ${depositAmount.toLocaleString('cs-CZ')} Kč — ta se započítá do konečné ceny.`
          : ' Kliknutím termín rovnou potvrdíte.'}
      </p>

      <div className="space-y-2">
        {proposals.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => accept(p.starts_at)}
            disabled={busy}
            className="flex w-full items-center justify-between gap-3 rounded-xl border border-emerald-300 bg-white px-4 py-3 text-left transition hover:border-emerald-500 hover:bg-emerald-50 disabled:opacity-60"
          >
            <span className="flex items-center gap-2 font-bold text-slate-900">
              <Clock className="h-4 w-4 text-emerald-600" />
              {fmtLong(p.starts_at)}
            </span>
            <span className="shrink-0 rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-bold text-white">
              {depositAmount > 0 ? `Zaplatit ${depositAmount.toLocaleString('cs-CZ')} Kč` : 'Potvrdit'}
            </span>
          </button>
        ))}
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          {depositAmount > 0 ? 'Termíny platí, dokud si je někdo nezarezervuje. Po kliknutí máte na platbu 10 minut.' : 'Termín se potvrdí ihned.'}
        </p>
        <button
          type="button"
          onClick={decline}
          disabled={busy}
          className="shrink-0 text-xs font-semibold text-slate-500 underline hover:text-slate-700 disabled:opacity-60"
        >
          Nevyhovuje ani jeden
        </button>
      </div>
    </div>
  )
}