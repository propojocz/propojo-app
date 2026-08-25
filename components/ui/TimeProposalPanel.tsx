'use client'
// components/ui/TimeProposalPanel.tsx
// Ruční návrh prvního termínu i změny už potvrzeného termínu.
// Otevírací doba se tu NEMĚNÍ na automatický seznam „volných“ časů.
// Poskytovatel vědomě zadá datum + čas a může přidat další možnosti.
// Původní potvrzený termín při změně zůstává platný, dokud zákazník nový nepřijme.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarDays, Loader2, Plus, Send, Clock, CalendarRange, RefreshCw, X } from 'lucide-react'
import {
  proposeTimes, acceptProposal, declineProposals, type Proposal,
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

function localDateString(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function combineLocalDateTime(date: string, time: string): string | null {
  if (!date || !time) return null
  const d = new Date(`${date}T${time}`)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

export default function TimeProposalPanel({
  orderId, isProvider, proposals, depositAmount, scheduledAt = null, depositStatus = null,
  itemName, customerName, prefFrom, prefTo, prefTime,
}: Props) {
  const router = useRouter()
  const isReschedule = !!scheduledAt
  const alreadyPaid = depositStatus === 'paid' || depositStatus === 'released'
  const paymentPending = depositStatus === 'pending'

  // draft = už přidané ruční možnosti. Žádné automatické generování z otevírací doby.
  const [draft, setDraft] = useState<string[]>([])
  const [newDate, setNewDate] = useState('')
  const [newClock, setNewClock] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [editMode, setEditMode] = useState(false)

  // ── POSKYTOVATEL ─────────────────────────────────────────
  if (isProvider) {
    const hasPref = !!(prefFrom || prefTo || prefTime)

    const resetEditor = () => {
      setDraft([])
      setNewDate('')
      setNewClock('')
      setError('')
      setEditMode(false)
    }

    const openEmptyEditor = () => {
      setDraft([])
      setNewDate('')
      setNewClock('')
      setError('')
      setEditMode(true)
    }

    const openExistingEditor = () => {
      setDraft(proposals.map((p) => p.starts_at).sort())
      setNewDate('')
      setNewClock('')
      setError('')
      setEditMode(true)
    }

    const currentIso = combineLocalDateTime(newDate, newClock)
    const currentIsValid = !!currentIso && new Date(currentIso).getTime() > Date.now()

    const allSelected = Array.from(new Set([
      ...draft,
      ...(currentIsValid && currentIso ? [currentIso] : []),
    ])).sort()

    const addCurrentAsAnother = () => {
      setError('')
      if (!newDate || !newClock) {
        setError('Vyberte datum i čas.')
        return
      }
      const iso = combineLocalDateTime(newDate, newClock)
      if (!iso || new Date(iso).getTime() <= Date.now()) {
        setError('Termín musí být v budoucnu.')
        return
      }
      if (draft.includes(iso)) {
        setError('Tento termín už máte přidaný.')
        return
      }
      if (draft.length >= 5) {
        // Šestá možnost může stále být právě rozepsaná v polích a rovnou se odešle.
        setError('Jednomu zákazníkovi můžete poslat maximálně 6 termínů.')
        return
      }
      setDraft((prev) => [...prev, iso].sort())
      setNewDate('')
      setNewClock('')
    }

    const removeTime = (iso: string) => {
      setDraft((prev) => prev.filter((x) => x !== iso))
      setError('')
    }

    const send = async () => {
      if (allSelected.length === 0) {
        setError('Vyberte datum a čas alespoň jednoho termínu.')
        return
      }
      if (allSelected.length > 6) {
        setError('Jednomu zákazníkovi můžete poslat maximálně 6 termínů.')
        return
      }
      setBusy(true); setError('')
      const res = await proposeTimes(orderId, allSelected)
      setBusy(false)
      if (!res.success) { setError(res.error); return }
      setEditMode(false)
      setNewDate('')
      setNewClock('')
      setDraft([])
      router.refresh()
    }

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
              onClick={openEmptyEditor}
              className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-amber-300 hover:bg-amber-50"
            >
              <RefreshCw className="h-4 w-4" /> Navrhnout změnu termínu
            </button>
          )}
        </div>
      )
    }

    // První domluva bez návrhů: kompaktní oranžová akce místo automatického seznamu.
    if (!isReschedule && proposals.length === 0 && !editMode) {
      return (
        <div className="rounded-2xl border-2 border-amber-300 bg-amber-50/60 p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
              <CalendarDays className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-black text-slate-900">Termín zatím není domluvený</h2>
              <p className="mt-0.5 text-sm leading-relaxed text-slate-600">
                {customerName ? <><strong>{customerName}</strong> čeká na váš návrh. </> : null}
                Vyberte konkrétní datum a čas, který mu chcete nabídnout.
              </p>

              {hasPref && (
                <p className="mt-2 inline-flex items-start gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-xs text-slate-600">
                  <CalendarRange className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                  <span>
                    Preference zákazníka:{' '}
                    {prefFrom && prefTo
                      ? <strong>{fmtDay(prefFrom)} – {fmtDay(prefTo)}</strong>
                      : prefFrom
                        ? <>od <strong>{fmtDay(prefFrom)}</strong></>
                        : prefTo
                          ? <>do <strong>{fmtDay(prefTo)}</strong></>
                          : null}
                    {prefTime ? <>{(prefFrom || prefTo) ? ', ' : ''}<strong>{TIME_LABELS[prefTime] ?? prefTime}</strong></> : null}
                  </span>
                </p>
              )}

              <div className="mt-3">
                <button
                  type="button"
                  onClick={openEmptyEditor}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-3.5 py-2.5 text-sm font-bold text-white transition hover:bg-amber-600"
                >
                  <CalendarDays className="h-4 w-4" /> Navrhnout termín
                </button>
              </div>
            </div>
          </div>
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
              : (proposals.length > 0 && !editMode ? 'Navržené termíny' : 'Navrhněte termín')}
          </h2>
        </div>

        {isReschedule && scheduledAt && (
          <div className="mb-3 rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm text-slate-700">
            Původní termín: <strong>{fmtLong(scheduledAt)}</strong>. Zůstává platný, dokud zákazník nový termín nepotvrdí.
          </div>
        )}

        {hasPref && !isReschedule && (
          <div className="mb-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm text-slate-700">
            <CalendarRange className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <span>
              Preference zákazníka:{' '}
              {prefFrom && prefTo
                ? <strong>{fmtDay(prefFrom)} – {fmtDay(prefTo)}</strong>
                : prefFrom
                  ? <>od <strong>{fmtDay(prefFrom)}</strong></>
                  : prefTo
                    ? <>do <strong>{fmtDay(prefTo)}</strong></>
                    : null}
              {prefTime ? <>{(prefFrom || prefTo) ? ', ' : ''}<strong>{TIME_LABELS[prefTime] ?? prefTime}</strong></> : null}.
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
              onClick={openExistingEditor}
              className="mt-3 text-xs font-semibold text-slate-500 hover:text-slate-700"
            >
              Upravit návrh
            </button>
          </>
        ) : (
          <>
            <p className="mb-3 text-sm leading-relaxed text-slate-600">
              {itemName ? <><strong>{itemName}</strong> — </> : null}
              Zadejte konkrétní datum a čas. Pokud chcete, můžete zákazníkovi nabídnout více možností.
              {isReschedule
                ? ' Původní termín zatím zůstává platný.'
                : alreadyPaid
                  ? ' Zákazník jeden z termínů potvrdí.'
                  : ' Zákazník si jeden vybere a případnou zálohou ho potvrdí.'}
            </p>

            {draft.length > 0 && (
              <div className="mb-3 space-y-2">
                <p className="text-xs font-semibold text-slate-500">Přidané možnosti</p>
                {draft.map((iso, index) => (
                  <div key={iso} className="flex items-center justify-between gap-3 rounded-xl border border-amber-300 bg-white px-3 py-2.5">
                    <span className="text-sm font-bold text-slate-800">{index + 1}. {fmtLong(iso)}</span>
                    <button
                      type="button"
                      onClick={() => removeTime(iso)}
                      disabled={busy}
                      className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-red-600 disabled:opacity-50"
                      aria-label="Odebrat termín"
                      title="Odebrat termín"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="rounded-xl border border-amber-200 bg-white p-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Datum</label>
                  <input
                    type="date"
                    value={newDate}
                    min={localDateString()}
                    onChange={(e) => { setNewDate(e.target.value); setError('') }}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Čas</label>
                  <input
                    type="time"
                    value={newClock}
                    step={300}
                    onChange={(e) => { setNewClock(e.target.value); setError('') }}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-amber-400"
                  />
                </div>
              </div>

              {newDate && newClock && currentIso && (
                <p className={`mt-2 text-xs ${currentIsValid ? 'text-slate-500' : 'text-red-600'}`}>
                  {currentIsValid ? <>Aktuálně zadáno: <strong>{fmtLong(currentIso)}</strong></> : 'Tento čas už je v minulosti.'}
                </p>
              )}

              <button
                type="button"
                onClick={addCurrentAsAnother}
                disabled={!newDate || !newClock || !currentIsValid || allSelected.length >= 6}
                className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-dashed border-amber-400 px-3 py-2 text-sm font-semibold text-amber-700 transition hover:bg-amber-50 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" /> Přidat další možnost
              </button>
            </div>

            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              Otevírací doba slouží jen jako informace o vašem běžném provozu. Pro tohoto zákazníka posíláte jen termíny, které sami zadáte tady.
            </p>

            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={resetEditor}
                disabled={busy}
                className="rounded-xl border border-slate-200 px-3 py-3 text-sm font-semibold text-slate-600 hover:bg-white disabled:opacity-60"
              >
                Zpět
              </button>
              <button
                type="button"
                onClick={send}
                disabled={busy || allSelected.length === 0 || allSelected.length > 6}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3 font-bold text-white transition hover:bg-amber-600 disabled:opacity-60"
              >
                {busy
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Odesílám…</>
                  : <><Send className="h-4 w-4" /> {isReschedule ? 'Odeslat návrh změny' : 'Odeslat'} ({allSelected.length === 1 ? '1 termín' : allSelected.length < 5 ? `${allSelected.length} termíny` : `${allSelected.length} termínů`})</>}
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