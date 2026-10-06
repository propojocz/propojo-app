'use client'
// components/ui/TimeProposalPanel.tsx
// Ruční návrh prvního termínu i změny už potvrzeného termínu.
// Otevírací doba se tu NEMĚNÍ na automatický seznam „volných“ časů.
// Poskytovatel vědomě zadá datum + čas a může přidat další možnosti.
// Původní potvrzený termín při změně zůstává platný, dokud zákazník nový nepřijme.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarDays, Loader2, Plus, Send, Clock, CalendarRange, RefreshCw, X, MessageCircle } from 'lucide-react'
import {
  proposeTimes, acceptProposal, declineProposals, type Proposal,
} from '@/lib/actions/time-proposals'
import { createDepositCheckout } from '@/lib/actions/deposit'
import { releaseUnpaidReservation } from '@/lib/actions/reservation-release'
import { BOOKING_POLICY } from '@/lib/booking/policy'
import { computeCommission } from '@/lib/booking/commission'
import BookingWizard from '@/components/ui/BookingWizard'

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
  /** Model B: termín je okno příjezdu, poskytovatel volí jeho délku. */
  arrivalWindow?: boolean
  /** Model v2: „Rezervační poplatek“ / „Cena výjezdu“. Prázdné = starý text se zálohou. */
  paymentLabel?: string | null
  /** Model v2, poskytovatel: kde zákazník je (obec) a jak daleko, pokud je mimo obvyklý dosah. */
  customerPlace?: string | null
  outOfRange?: { distanceKm: number; radiusKm: number } | null
}

const kc = (n: number) => `${n.toLocaleString('cs-CZ')} Kč`

/** Provize Propojo z dané částky (pro náhled poskytovateli); null = částka nejde zaplatit. */
function feeKc(chargeKc: number): number | null {
  if (!Number.isInteger(chargeKc) || chargeKc <= 0) return null
  const r = computeCommission(chargeKc * 100)
  return r.ok ? r.commission.applicationFeeHalere / 100 : null
}

const fmtLong = (iso: string) =>
  new Intl.DateTimeFormat('cs-CZ', {
    weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))

const fmtTime = (iso: string) =>
  new Intl.DateTimeFormat('cs-CZ', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso))

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
  arrivalWindow = false, paymentLabel = null, customerPlace = null, outOfRange = null,
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
  // Termín domluvený v chatu: poskytovatel zadá jen ten jeden, zákazník ho potvrdí a zaplatí.
  const [agreedMode, setAgreedMode] = useState(false)
  // Zákazník: otevřený krokový průvodce pro vybraný návrh termínu.
  const [wizardProposal, setWizardProposal] = useState<{ starts_at: string; ends_at: string } | null>(null)
  const [windowMinutes, setWindowMinutes] = useState<number>(BOOKING_POLICY.arrivalWindow.defaultMinutes)
  // Cena upravená poskytovatelem pro tuto objednávku (např. delší cesta) – zákazník ji potvrdí s termínem.
  const [priceEdit, setPriceEdit] = useState(false)
  const [priceInput, setPriceInput] = useState('')
  const [priceNote, setPriceNote] = useState('')

  // Model v2: cenu jde upravit jen u prvního termínu před platbou.
  const canAdjustPrice = !!paymentLabel && !isReschedule && !alreadyPaid && depositAmount > 0
  // Cena, kterou nesou aktuální návrhy (všechny stejnou); null = cena z nabídky.
  const proposalChargeHalere = proposals.find((p) => p.charge_halere != null)?.charge_halere
  const proposalPriceKc = proposalChargeHalere != null ? proposalChargeHalere / 100 : null
  const proposalPriceNote = proposals.find((p) => p.price_note)?.price_note ?? null
  // Kolik zákazník zaplatí podle aktuálního návrhu
  const effectiveAmount = proposalPriceKc ?? depositAmount

  // U výjezdu je termín okno příjezdu: „út 6. 10. 14:00–15:00“.
  const fmtProposal = (p: Proposal) =>
    arrivalWindow ? `${fmtLong(p.starts_at)}–${fmtTime(p.ends_at)}` : fmtLong(p.starts_at)
  const fmtDraft = (iso: string) =>
    arrivalWindow
      ? `${fmtLong(iso)}–${fmtTime(new Date(new Date(iso).getTime() + windowMinutes * 60000).toISOString())}`
      : fmtLong(iso)

  // ── POSKYTOVATEL ─────────────────────────────────────────
  if (isProvider) {
    const hasPref = !!(prefFrom || prefTo || prefTime)

    const resetEditor = () => {
      setDraft([])
      setNewDate('')
      setNewClock('')
      setError('')
      setEditMode(false)
      setAgreedMode(false)
      setPriceEdit(false)
    }

    const openAgreedEditor = () => {
      setDraft([])
      setNewDate('')
      setNewClock('')
      setError('')
      setAgreedMode(true)
      setEditMode(true)
    }

    const openEmptyEditor = () => {
      setDraft([])
      setNewDate('')
      setNewClock('')
      setError('')
      setAgreedMode(false)
      setEditMode(true)
    }

    const openExistingEditor = () => {
      setPriceEdit(proposalPriceKc != null)
      setPriceInput(proposalPriceKc != null ? String(proposalPriceKc) : '')
      setPriceNote(proposalPriceNote ?? '')
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
      let price: { kc: number; note: string | null } | null = null
      if (canAdjustPrice && priceEdit) {
        const n = Number(priceInput.replace(/\s/g, '').replace(',', '.'))
        if (!Number.isInteger(n) || n <= 0) {
          setError('Zadejte cenu v celých korunách.')
          return
        }
        if (feeKc(n) == null) {
          setError(`Nejnižší cena je ${kc(BOOKING_POLICY.minChargeHalere / 100)}.`)
          return
        }
        if (n !== depositAmount) price = { kc: n, note: priceNote.trim() || null }
      }
      setBusy(true); setError('')
      const res = await proposeTimes(orderId, allSelected, arrivalWindow ? windowMinutes : undefined, price)
      setBusy(false)
      if (!res.success) { setError(res.error); return }
      setEditMode(false)
      setNewDate('')
      setNewClock('')
      setDraft([])
      setPriceEdit(false)
      router.refresh()
    }

    // Shrnutí poptávky s cenou: co zákazník zaplatí, provize, případně vzdálenost.
    const summaryAmount = proposals.length > 0 && !editMode ? effectiveAmount : depositAmount
    const summaryFee = feeKc(summaryAmount)
    const priceSummary = canAdjustPrice ? (
      <div className="mt-3 rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm text-slate-700">
        <div className="flex items-baseline justify-between gap-3">
          <span>
            {itemName ? <strong>{itemName}</strong> : 'Objednávka'}
            {customerPlace ? <span className="text-slate-500"> · {customerPlace}</span> : null}
          </span>
          <span className="shrink-0 font-black text-slate-900">{kc(summaryAmount)}</span>
        </div>
        <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
          Zákazník zaplatí {paymentLabel} {kc(summaryAmount)}
          {proposals.length > 0 && !editMode && proposalPriceKc != null ? ' (upravená cena)' : ''}.
          {summaryFee != null ? ` Provize Propojo ${kc(summaryFee)}, poplatek za platbu si účtuje Stripe.` : ''}
        </p>
        {outOfRange && (
          <p className="mt-1 text-xs leading-relaxed text-amber-800">
            Zákazník je asi {outOfRange.distanceKm} km daleko (váš obvyklý dosah je {outOfRange.radiusKm} km). Pokud vám cena nestačí, upravte ji při návrhu termínu.
          </p>
        )}
      </div>
    ) : null

    const typedPrice = Number(priceInput.replace(/\s/g, '').replace(',', '.'))
    const typedFee = priceInput ? feeKc(typedPrice) : null
    const priceEditor = canAdjustPrice ? (
      <div className="mt-3 rounded-xl border border-amber-200 bg-white p-3">
        {!priceEdit ? (
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-slate-600">Zákazník zaplatí {paymentLabel} <strong className="text-slate-900">{kc(depositAmount)}</strong></span>
            <button
              type="button"
              onClick={() => { setPriceEdit(true); setPriceInput(String(depositAmount)); setError('') }}
              className="shrink-0 text-xs font-semibold text-amber-700 underline hover:text-amber-800"
            >
              Upravit cenu
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[10rem_1fr]">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Nová cena (Kč)</label>
                <input
                  type="number"
                  inputMode="numeric"
                  min={BOOKING_POLICY.minChargeHalere / 100}
                  step={1}
                  value={priceInput}
                  onChange={(e) => { setPriceInput(e.target.value); setError('') }}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-amber-400"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Důvod pro zákazníka (nepovinné)</label>
                <input
                  type="text"
                  maxLength={200}
                  value={priceNote}
                  placeholder="např. delší cesta"
                  onChange={(e) => setPriceNote(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-amber-400"
                />
              </div>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              Původně {kc(depositAmount)}.
              {typedFee != null ? ` Provize Propojo ${kc(typedFee)}.` : priceInput ? ` Nejnižší cena je ${kc(BOOKING_POLICY.minChargeHalere / 100)}.` : ''}
              {' '}Zákazník novou cenu uvidí a potvrdí spolu s termínem.
            </p>
            <button
              type="button"
              onClick={() => { setPriceEdit(false); setPriceInput(''); setPriceNote('') }}
              className="mt-1 text-xs font-semibold text-slate-500 hover:text-slate-700"
            >
              Ponechat původní cenu
            </button>
          </>
        )}
      </div>
    ) : null

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

              {priceSummary}

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={openEmptyEditor}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-3.5 py-2.5 text-sm font-bold text-white transition hover:bg-amber-600"
                >
                  <CalendarDays className="h-4 w-4" /> Navrhnout termín
                </button>
                <button
                  type="button"
                  onClick={openAgreedEditor}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-white px-3.5 py-2.5 text-sm font-bold text-amber-700 transition hover:bg-amber-50"
                >
                  <MessageCircle className="h-4 w-4" /> Termín už máme domluvený v chatu
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
              : (proposals.length > 0 && !editMode ? 'Navržené termíny' : agreedMode ? 'Zadejte domluvený termín' : 'Navrhněte termín')}
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
                  {fmtProposal(p)}
                </span>
              ))}
            </div>
            {priceSummary}
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
              {agreedMode
                ? (arrivalWindow
                    ? 'Zadejte den, začátek a délku okna příjezdu, na kterých jste se se zákazníkem domluvili.'
                    : 'Zadejte datum a čas, na kterých jste se se zákazníkem domluvili.')
                : arrivalWindow
                  ? 'Zadejte den, začátek a délku okna, ve kterém k zákazníkovi přijedete. Můžete nabídnout více možností.'
                  : 'Zadejte konkrétní datum a čas. Pokud chcete, můžete zákazníkovi nabídnout více možností.'}
              {agreedMode && paymentLabel
                ? ` Zákazníkovi ho pošleme k potvrzení, jedním kliknutím ho potvrdí a zaplatí ${paymentLabel}.`
                : isReschedule
                ? ' Původní termín zatím zůstává platný.'
                : alreadyPaid
                  ? ' Zákazník jeden z termínů potvrdí.'
                  : paymentLabel
                    ? ` Zákazník si jeden vybere a zaplatí ${paymentLabel}.`
                    : ' Zákazník si jeden vybere a případnou zálohou ho potvrdí.'}
            </p>

            {draft.length > 0 && (
              <div className="mb-3 space-y-2">
                <p className="text-xs font-semibold text-slate-500">Přidané možnosti</p>
                {draft.map((iso, index) => (
                  <div key={iso} className="flex items-center justify-between gap-3 rounded-xl border border-amber-300 bg-white px-3 py-2.5">
                    <span className="text-sm font-bold text-slate-800">{index + 1}. {fmtDraft(iso)}</span>
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
              {arrivalWindow && (
                <div className="mb-3">
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Přijedu v rozmezí</label>
                  <div className="flex flex-wrap gap-2">
                    {BOOKING_POLICY.arrivalWindow.optionsMinutes.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setWindowMinutes(m)}
                        className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                          windowMinutes === m
                            ? 'border-amber-500 bg-amber-100 text-amber-800'
                            : 'border-slate-200 text-slate-600 hover:border-amber-300'
                        }`}
                      >
                        {m < 60 ? `${m} min` : m % 60 === 0 ? `${m / 60} h` : `${Math.floor(m / 60)} h ${m % 60} min`}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                    Jak dlouhé rozmezí si necháte na příjezd – zákazník uvidí třeba „přijede mezi 11:15 a 13:15“.
                    Není to doba cesty ani délka prohlídky, jen čas, kdy u zákazníka nejpozději budete.
                  </p>
                </div>
              )}
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
                  <label className="mb-1 block text-xs font-semibold text-slate-600">{arrivalWindow ? 'Nejdříve v' : 'Čas'}</label>
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
                  {currentIsValid ? <>Aktuálně zadáno: <strong>{fmtDraft(currentIso)}</strong></> : 'Tento čas už je v minulosti.'}
                </p>
              )}

              {/* Domluvený termín je jen jeden – další možnosti nedávají smysl. */}
              {!agreedMode && (
                <button
                  type="button"
                  onClick={addCurrentAsAnother}
                  disabled={!newDate || !newClock || !currentIsValid || allSelected.length >= 6}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-dashed border-amber-400 px-3 py-2 text-sm font-semibold text-amber-700 transition hover:bg-amber-50 disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" /> Přidat další možnost
                </button>
              )}
            </div>

            {priceEditor}

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
                  : agreedMode
                    ? <><Send className="h-4 w-4" /> Odeslat zákazníkovi k potvrzení</>
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
    // Model v2: termín se přijme až v posledním kroku průvodce (adresa, shrnutí, souhlas, platba).
    if (paymentLabel && !isReschedule && !alreadyPaid) {
      const p = proposals.find((x) => x.starts_at === start)
      if (p) { setWizardProposal({ starts_at: p.starts_at, ends_at: p.ends_at }); return }
    }
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

  // Jediný návrh (typicky termín domluvený v chatu): jen potvrdit a zaplatit.
  const singleOffer = !isReschedule && proposals.length === 1
  const priceChanged = proposalPriceKc != null && proposalPriceKc !== depositAmount

  return (
    <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50/70 p-5">
      {wizardProposal && (
        <BookingWizard orderId={orderId} proposal={wizardProposal} onClose={() => setWizardProposal(null)} />
      )}
      <div className="mb-1 flex items-center gap-2">
        <CalendarDays className="h-5 w-5 text-emerald-600" />
        <h2 className="font-black text-slate-900">
          {isReschedule
            ? 'Poskytovatel navrhuje změnu termínu'
            : singleOffer
              ? (arrivalWindow ? 'Potvrďte termín výjezdu' : 'Potvrďte termín')
              : 'Vyberte si termín'}
        </h2>
      </div>

      {priceChanged && paymentLabel && (
        <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
          Poskytovatel upravil {paymentLabel}: <span className="text-amber-700 line-through">{kc(depositAmount)}</span>{' '}
          <strong>{kc(proposalPriceKc!)}</strong>{proposalPriceNote ? <> – {proposalPriceNote}</> : null}.
          {' '}Potvrzením termínu souhlasíte s touto cenou. Pokud vám nevyhovuje, napište mu ve zprávách.
        </div>
      )}

      {isReschedule && scheduledAt && (
        <div className="mb-3 rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-sm text-slate-700">
          Váš současný termín je <strong>{fmtLong(scheduledAt)}</strong>. Zůstává platný, dokud nepotvrdíte jiný.
        </div>
      )}

      <p className="mb-3 text-sm leading-relaxed text-slate-600">
        {singleOffer
          ? (arrivalWindow
              ? 'Poskytovatel vám poslal termín výjezdu, třeba ten, na kterém jste se domluvili ve zprávách. Čas znamená okno, ve kterém k vám přijede.'
              : 'Poskytovatel vám poslal termín, třeba ten, na kterém jste se domluvili ve zprávách.')
          : arrivalWindow
            ? 'Poskytovatel vám nabídl tyto termíny výjezdu. Čas znamená okno, ve kterém k vám přijede.'
            : 'Poskytovatel vám nabídl tyhle časy.'}
        {isReschedule
          ? ' Přijetím jednoho z nich se původní termín nahradí.'
          : paymentLabel && effectiveAmount > 0
            ? ` Kliknutím termín vyberete a zaplatíte ${paymentLabel} ${effectiveAmount.toLocaleString('cs-CZ')} Kč. Termín navrhl sám poskytovatel, takže se rezervace po zaplacení hned potvrdí.`
            : effectiveAmount > 0
              ? ` Kliknutím termín potvrdíte a zaplatíte zálohu ${effectiveAmount.toLocaleString('cs-CZ')} Kč — ta se započítá do konečné ceny.`
              : ' Kliknutím termín rovnou potvrdíte.'}
      </p>

      <div className="space-y-2">
        {proposals.map((p) => {
          // Návrh, který už proběhl nebo začíná dřív než za minimální předstih, nejde přijmout ani zaplatit.
          const prosly = new Date(p.starts_at).getTime() < Date.now() + BOOKING_POLICY.minLeadMinutes * 60_000
          if (prosly) {
            return (
              <div key={p.id} className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left">
                <span className="flex items-center gap-2 font-bold text-slate-400 line-through">
                  <Clock className="h-4 w-4" />
                  {fmtProposal(p)}
                </span>
                <span className="shrink-0 text-xs font-semibold text-slate-500">Už nejde vybrat</span>
              </div>
            )
          }
          return (
          <button
            key={p.id}
            type="button"
            onClick={() => accept(p.starts_at)}
            disabled={busy}
            className="flex w-full items-center justify-between gap-3 rounded-xl border border-emerald-300 bg-white px-4 py-3 text-left transition hover:border-emerald-500 hover:bg-emerald-50 disabled:opacity-60"
          >
            <span className="flex items-center gap-2 font-bold text-slate-900">
              <Clock className="h-4 w-4 text-emerald-600" />
              {fmtProposal(p)}
            </span>
            <span className="shrink-0 rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-bold text-white">
              {isReschedule || alreadyPaid
                ? 'Přijmout změnu'
                : effectiveAmount > 0
                  ? (singleOffer
                      ? `Potvrdit a zaplatit ${effectiveAmount.toLocaleString('cs-CZ')} Kč`
                      : `Zaplatit ${effectiveAmount.toLocaleString('cs-CZ')} Kč`)
                  : 'Potvrdit'}
            </span>
          </button>
          )
        })}
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          {isReschedule
            ? 'Dokud změnu nepotvrdíte, platí původní termín.'
            : effectiveAmount > 0
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