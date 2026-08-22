'use client'
// components/ui/TimeProposalPanel.tsx
// Návrhy prvního termínu i změny už potvrzeného termínu.
// Původní termín se při změně nemaže: zůstává platný, dokud zákazník nepřijme nový.

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarDays, Loader2, Plus, Send, Clock, Sparkles, CalendarRange, RefreshCw } from 'lucide-react'
import {
  suggestTimes, proposeTimes, acceptProposal, declineProposals, type Proposal,
} from '@/lib/actions/time-proposals'
import { createDepositCheckout } from '@/lib/actions/deposit'
import { releaseUnpaidReservation } from '@/lib/actions/reservation-release'

interface Props {
  orderId: string
  isProvider: boolean
  /** Aktuální návrhy (načtené na serveru). */
  proposals: Proposal[]
  /** Kolik zákazník zaplatí při prvním potvrzení. 0 = bez zálohy. */
  depositAmount: number
  /** Už potvrzený termín. Když existuje, panel pracuje jako změna termínu. */
  scheduledAt?: string | null
  /** Potřebujeme vědět, zda už je záloha zaplacená — při změně se neplatí podruhé. */
  depositStatus?: string | null
  itemName?: string | null
  customerName?: string | null
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

function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16)
}

export default function TimeProposalPanel({
  orderId, isProvider, proposals, depositAmount, scheduledAt = null, depositStatus = null,
  itemName, customerName, prefFrom, prefTo, prefTime,
}: Props) {
  const router = useRouter()
  const isReschedule = !!scheduledAt
  const alreadyPaid = depositStatus === 'paid' || depositStatus === 'released'
  const paymentPending = depositStatus === 'pending'

  // draft = všechny kandidátní časy, které má poskytovatel k dispozici v panelu.
  // selected = jen časy, které skutečně pošle tomuto zákazníkovi. Odškrtnutí
  // kandidáta ho NEMAŽE z kalendáře ani z dostupnosti pro jiné zákazníky.
  const [draft, setDraft] = useState<string[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [newTime, setNewTime] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [editMode, setEditMode] = useState(false)
  const [loadingHint, setLoadingHint] = useState(isProvider && proposals.length === 0 && !isReschedule)

  // První domluva: předvyplníme rovnou. Změna potvrzeného termínu: až po kliknutí
  // „Navrhnout změnu", aby panel na běžné objednávce nebyl zbytečně rozbalený.
  useEffect(() => {
    if (!isProvider || proposals.length > 0) return
    if (isReschedule && !editMode) return

    let cancelled = false
    setLoadingHint(true)
    suggestTimes(orderId)
      .then((times) => {
        if (cancelled) return
        const values = times.map((t) => t.start)
        setDraft(values)
        setSelected(values.slice(0, 6))
        setLoadingHint(false)
      })
      .catch(() => { if (!cancelled) setLoadingHint(false) })
    return () => { cancelled = true }
  }, [orderId, isProvider, proposals.length, isReschedule, editMode])

  // ── POSKYTOVATEL ─────────────────────────────────────────
  if (isProvider) {
    const addTime = () => {
      if (!newTime) return
      const iso = new Date(newTime).toISOString()
      if (draft.includes(iso)) {
        setSelected((prev) => prev.includes(iso) ? prev : prev.length < 6 ? [...prev, iso].sort() : prev)
        setNewTime('')
        return
      }
      if (draft.length >= 24) { setError('V panelu už je dost kandidátů. Odškrtněte ty, které nechcete poslat.'); return }
      setDraft((prev) => [...prev, iso].sort())
      setSelected((prev) => prev.length < 6 ? [...prev, iso].sort() : prev)
      setNewTime('')
      setError('')
    }

    const send = async () => {
      setBusy(true); setError('')
      const res = await proposeTimes(orderId, selected)
      setBusy(false)
      if (!res.success) { setError(res.error); return }
      setEditMode(false)
      router.refresh()
    }

    const hasPref = !!(prefFrom && prefTo)

    // Potvrzený termín bez aktivního návrhu: jen kompaktní možnost změny.
    if (isReschedule && proposals.length === 0 && !editMode) {
      return (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Potvrzený termín</p>
              <p className="mt-0.5 font-bold text-slate-900">{fmtLong(scheduledAt!)}</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                Pokud se termín musí změnit, navrhněte zákazníkovi nové možnosti. Původní termín zůstane platný, dokud zákazník nový nepotvrdí.
              </p>
            </div>
            <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
          </div>

          {paymentPending ? (
            <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
              Zákazník právě dokončuje platbu. Termín teď neměňte — nejdřív musí platbu dokončit nebo zrušit.
            </p>
          ) : (
            <button
              type="button"
              onClick={() => { setDraft([]); setSelected([]); setError(''); setEditMode(true) }}
              className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-amber-300 hover:bg-amber-50"
            >
              <RefreshCw className="h-4 w-4" /> Navrhnout změnu termínu
            </button>
          )}
        </div>
      )
    }

    return (
      <div className="rounded-2xl border-2 border-amber-300 bg-amber-50/60 p-5">
        <div className="mb-1 flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-amber-600" />
          <h2 className="font-black text-slate-900">
            {isReschedule
              ? (proposals.length > 0 && !editMode ? 'Navržená změna termínu' : 'Navrhněte nový termín')
              : (proposals.length > 0 ? 'Navržené termíny' : 'Navrhněte termín')}
            {!isReschedule && !proposals.length && customerName
              ? <span className="font-normal text-slate-500"> pro: {customerName}</span>
              : null}
          </h2>
        </div>

        {isReschedule && scheduledAt && (
          <div className="mb-3 rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm text-slate-700">
            Původní termín: <strong>{fmtLong(scheduledAt)}</strong>. Zůstává platný, dokud zákazník nový termín nepotvrdí.
          </div>
        )}

        {hasPref && !isReschedule && proposals.length === 0 && (
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
              {isReschedule
                ? 'Zákazník si vybírá z těchto nových časů. Do té doby zůstává původní termín beze změny.'
                : 'Zákazník si vybírá z těchto časů. Dokud jeden nepřijme a případně nezaplatí, termín se nikomu nedrží.'}
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
              onClick={() => {
                const values = proposals.map((p) => p.starts_at)
                setDraft(values)
                setSelected(values)
                setEditMode(true)
              }}
              className="mt-3 text-xs font-semibold text-slate-500 hover:text-slate-700"
            >
              Upravit návrh
            </button>
          </>
        ) : (
          <>
            <p className="mb-3 text-sm leading-relaxed text-slate-600">
              {itemName ? <><strong>{itemName}</strong> — n</> : 'N'}abídněte zákazníkovi konkrétní časy.
              {isReschedule
                ? ' Zákazník jeden přijme; do té doby platí původní termín.'
                : alreadyPaid
                  ? ' Zákazník jeden potvrdí.'
                  : ' Vybere si jeden a případnou zálohou ho potvrdí.'}
            </p>

            {loadingHint && (
              <p className="mb-2 flex items-center gap-1.5 text-xs text-slate-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Hledám ve vašem rozvrhu volné časy…
              </p>
            )}

            {draft.length > 0 && (
              <>
                <p className="mb-2 flex items-start gap-1.5 text-xs font-semibold leading-relaxed text-amber-700">
                  <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    Zaškrtněte jen termíny, které chcete poslat tomuto zákazníkovi.
                    Odškrtnutí nic nemaže z vašeho kalendáře a termín můžete nabídnout jinému zákazníkovi.
                  </span>
                </p>
                <div className="space-y-2">
                  {draft.map((iso) => {
                    const checked = selected.includes(iso)
                    return (
                      <label
                        key={iso}
                        className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
                          checked
                            ? 'border-amber-400 bg-white text-slate-900'
                            : 'border-slate-200 bg-white/70 text-slate-500 hover:border-amber-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setError('')
                            if (checked) {
                              setSelected((prev) => prev.filter((x) => x !== iso))
                              return
                            }
                            if (selected.length >= 6) {
                              setError('Jednomu zákazníkovi můžete poslat maximálně 6 termínů.')
                              return
                            }
                            setSelected((prev) => [...prev, iso].sort())
                          }}
                          className="h-4 w-4 accent-amber-500"
                        />
                        <span>{fmtLong(iso)}</span>
                      </label>
                    )
                  })}
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Vybráno {selected.length} z {draft.length} · odeslat lze maximálně 6 termínů.
                </p>
              </>
            )}

            <div className="mt-3 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center">
              <input
                type="datetime-local"
                value={newTime}
                onChange={(e) => setNewTime(e.target.value)}
                min={toLocalInput(new Date().toISOString())}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400 sm:w-auto"
              />
              <button
                type="button"
                onClick={addTime}
                disabled={!newTime}
                className="inline-flex items-center justify-center gap-1 rounded-xl border border-dashed border-amber-400 px-3 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" /> Přidat čas
              </button>
            </div>

            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

            <div className="mt-3 flex gap-2">
              {isReschedule && (
                <button
                  type="button"
                  onClick={() => { setEditMode(false); setDraft([]); setSelected([]); setError('') }}
                  disabled={busy}
                  className="rounded-xl border border-slate-200 px-3 py-3 text-sm font-semibold text-slate-600 hover:bg-white disabled:opacity-60"
                >
                  Zpět
                </button>
              )}
              <button
                type="button"
                onClick={send}
                disabled={busy || selected.length === 0}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3 font-bold text-white transition hover:bg-amber-600 disabled:opacity-60"
              >
                {busy
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Odesílám…</>
                  : <><Send className="h-4 w-4" /> {isReschedule ? 'Odeslat návrh změny' : 'Odeslat návrh'} ({selected.length === 1 ? '1 termín' : selected.length < 5 ? `${selected.length} termíny` : `${selected.length} termínů`})</>}
              </button>
            </div>
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
      // U domluveného termínu acceptProposal už nastavil dočasný hold. Když se
      // checkout vůbec nepodaří založit, vrátíme objednávku hned do domlouvání,
      // jinak by visela jako 'pending' bez možnosti zaplatit.
      await releaseUnpaidReservation(orderId, 'checkout_failed')
      setError(`${pay.error} Termín jsme nepotvrdili; můžete se domluvit na jiném.`)
      setBusy(false)
      router.refresh()
    }
  }

  const decline = async () => {
    const text = isReschedule
      ? 'Odmítnout navrženou změnu termínu? Původní termín zůstane platný.'
      : 'Odmítnout všechny navržené termíny? Poskytovatel se pokusí nabídnout jiné.'
    if (!confirm(text)) return
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
        <h2 className="font-black text-slate-900">
          {isReschedule ? 'Poskytovatel navrhuje změnu termínu' : 'Vyberte si termín'}
        </h2>
      </div>

      {isReschedule && scheduledAt && (
        <div className="mb-3 rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-sm text-slate-700">
          Váš současný termín je <strong>{fmtLong(scheduledAt)}</strong>. Zůstává platný, dokud nepotvrdíte jiný.
        </div>
      )}

      <p className="mb-3 text-sm leading-relaxed text-slate-600">
        Poskytovatel vám nabídl tyhle časy.
        {isReschedule
          ? ' Přijetím jednoho z nich se původní termín nahradí.'
          : depositAmount > 0
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
              {isReschedule || alreadyPaid
                ? 'Přijmout změnu'
                : depositAmount > 0
                  ? `Zaplatit ${depositAmount.toLocaleString('cs-CZ')} Kč`
                  : 'Potvrdit'}
            </span>
          </button>
        ))}
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          {isReschedule
            ? 'Dokud změnu nepotvrdíte, platí původní termín.'
            : depositAmount > 0
              ? 'Po výběru se termín krátce podrží, abyste stihli dokončit platbu.'
              : 'Termín se potvrdí ihned.'}
        </p>
        <button
          type="button"
          onClick={decline}
          disabled={busy}
          className="shrink-0 text-xs font-semibold text-slate-500 underline hover:text-slate-700 disabled:opacity-60"
        >
          {isReschedule ? 'Ponechat původní termín' : 'Nevyhovuje ani jeden'}
        </button>
      </div>
    </div>
  )
}