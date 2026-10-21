'use client'
// components/ui/BookingNoShow.tsx
// Vrstva 5 (21. 10. 2026): v detailu rezervace nad zprávami – časově citlivé akce.
// - poskytovatel u výjezdu: „Jsem na místě“ (check-in s polohou a volitelnou fotkou);
// - zákazník po termínu: „Poskytovatel se nedostavil“ (do 48 h);
// - poskytovatel: vyjádření k nahlášení (souhlasím → vrácení peněz / nesouhlasím s důvodem);
// - obě strany: záznamy check-inu, nahlášení a reakce (P2B čl. 9 – poskytovatel vidí své záznamy).

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Camera, Check, Loader2, MapPin, ShieldQuestion, X } from 'lucide-react'
import { answerNoShow, checkIn, checkInPhotoTarget, reportNoShow } from '@/lib/actions/booking'
import { createClient } from '@/lib/supabase/client'
import { resizeImage } from '@/lib/image-resize'

export type CheckInView = { id: string; atText: string; valid: boolean; issues: string[]; distanceM: number | null; photoUrl: string | null }
export type NoShowView = {
  /** Poskytovatel: okno pro „Jsem na místě“ (null = u této rezervace ne) */
  checkIn: { canNow: boolean; opensText: string; closesText: string; windowEndText: string } | null
  checkIns: CheckInView[]
  /** Zákazník: smí teď nahlásit nedostavení, do kdy */
  report: { canNow: boolean; untilText: string } | null
  /** Hlášení, pokud existuje */
  reported: {
    atText: string
    note: string | null
    deadlineText: string | null
    open: boolean
    outcome: string | null
    response: { agree: boolean; note: string | null; atText: string } | null
  } | null
}

const ISSUE_TEXT: Record<string, string> = {
  late: 'zaznamenáno až po konci okna příjezdu',
  outside_time_window: 'mimo dobu výjezdu',
  no_location: 'bez polohy (přístup k poloze nebyl povolen)',
  low_accuracy: 'poloha byla nepřesná',
  no_target_address: 'u rezervace chybí souřadnice adresy',
  too_far: 'příliš daleko od adresy',
}

function issuesText(issues: string[], distanceM: number | null): string {
  return issues.map((i) => (i === 'too_far' && distanceM != null ? `${ISSUE_TEXT[i]} (${distanceM.toLocaleString('cs-CZ')} m)` : ISSUE_TEXT[i] ?? i)).join(', ')
}

export default function BookingNoShow({
  orderId,
  isProvider,
  amountKc,
  view,
}: {
  orderId: string
  isProvider: boolean
  amountKc: number
  view: NoShowView
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [repOpen, setRepOpen] = useState(false)
  const [repNote, setRepNote] = useState('')
  const [dispOpen, setDispOpen] = useState(false)
  const [dispNote, setDispNote] = useState('')
  const castka = `${amountKc.toLocaleString('cs-CZ')} Kč`
  const hasValidCheckIn = view.checkIns.some((c) => c.valid)

  const position = () => new Promise<{ permission: 'granted' | 'denied' | 'unavailable'; lat: number | null; lng: number | null; accuracyM: number | null }>((resolve) => {
    if (!('geolocation' in navigator)) { resolve({ permission: 'unavailable', lat: null, lng: null, accuracyM: null }); return }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ permission: 'granted', lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: Math.round(p.coords.accuracy) }),
      (e) => resolve({ permission: e.code === e.PERMISSION_DENIED ? 'denied' : 'unavailable', lat: null, lng: null, accuracyM: null }),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    )
  })

  const doCheckIn = async () => {
    setBusy(true); setError(''); setInfo('')
    try {
      const pos = await position()
      let photoPath: string | null = null
      // Fotka je nepovinná: když nejde zpracovat (např. formát HEIC) nebo nahrát, příjezd se zapíše bez ní
      let photoFailed = false
      if (photo) {
        try {
          const target = await checkInPhotoTarget(orderId)
          if (target.success) {
            const prepared = await resizeImage(photo, 1600, 0.8)
            const { error: upErr } = await createClient().storage.from('check-in-photos')
              .uploadToSignedUrl(target.path, target.token, prepared.blob, { contentType: prepared.contentType })
            if (!upErr) photoPath = target.path
            else photoFailed = true
          } else photoFailed = true
        } catch {
          photoFailed = true
        }
      }
      const res = await checkIn(orderId, { ...pos, photoPath })
      if (!res.success) { setError(res.error); return }
      setPhoto(null)
      if (fileRef.current) fileRef.current.value = ''
      setInfo((res.valid
        ? `Příjezd zaznamenán${res.distanceM != null ? ` – ${res.distanceM.toLocaleString('cs-CZ')} m od adresy` : ''}.`
        : `Záznam je uložený, ale nesplňuje podmínky platného příjezdu: ${issuesText(res.issues, res.distanceM)}.`)
        + (photoFailed ? ' Fotku se nepodařilo nahrát – příjezd je zapsaný bez ní.' : ''))
      router.refresh()
    } catch {
      setError('Příjezd se nepodařilo zaznamenat. Zkuste to prosím znovu.')
    } finally {
      setBusy(false)
    }
  }

  const doReport = async () => {
    if (!confirm('Opravdu nahlásit, že se poskytovatel nedostavil?')) return
    setBusy(true); setError('')
    const res = await reportNoShow(orderId, repNote)
    setBusy(false)
    if (!res.success) setError(res.error)
    else { setRepOpen(false); router.refresh() }
  }

  const doAnswer = async (agree: boolean) => {
    if (agree && !confirm(`Souhlasíte, že jste se nedostavili? Zákazníkovi se z vašeho Stripe účtu vrátí celá částka ${castka}.`)) return
    setBusy(true); setError('')
    const res = await answerNoShow(orderId, agree, agree ? null : dispNote)
    setBusy(false)
    if (!res.success) setError(res.error)
    else { setDispOpen(false); router.refresh() }
  }

  const r = view.reported
  const showCheckInCard = isProvider && view.checkIn && (view.checkIn.canNow || view.checkIns.length === 0)
  if (!showCheckInCard && view.checkIns.length === 0 && !r && !(!isProvider && view.report?.canNow)) return null

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      {/* ── Poskytovatel: „Jsem na místě“ ── */}
      {showCheckInCard && view.checkIn && (
        <div className={`rounded-xl border-2 p-4 ${view.checkIn.canNow ? 'border-orange-300 bg-orange-50' : 'border-slate-200 bg-slate-50'}`}>
          <p className="flex items-center gap-1.5 text-sm font-black text-slate-900"><MapPin className="h-4 w-4 text-orange-500" /> Jsem na místě</p>
          {view.checkIn.canNow ? (
            <>
              <p className="mt-1 text-sm leading-relaxed text-slate-700">
                Až dorazíte k zákazníkovi, zaznamenejte příjezd. Platí do {view.checkIn.windowEndText} (konec okna příjezdu),
                při zdržení ještě do {view.checkIn.closesText} – pak se zapíše jako „pozdě“.
              </p>
              <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700">
                <Camera className="h-4 w-4 text-slate-500" />
                {photo ? photo.name : 'Přidat fotku (nepovinné)'}
                <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
                  onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
                {photo && (
                  <button type="button" onClick={(e) => { e.preventDefault(); setPhoto(null); if (fileRef.current) fileRef.current.value = '' }}
                    className="text-slate-400 hover:text-slate-600" aria-label="Odebrat fotku"><X className="h-4 w-4" /></button>
                )}
              </label>
              <button type="button" onClick={doCheckIn} disabled={busy}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-3 text-base font-black text-white hover:bg-orange-600 disabled:opacity-60 sm:w-auto">
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <MapPin className="h-5 w-5" />} Jsem na místě
              </button>
              <p className="mt-2 text-xs leading-relaxed text-slate-500">
                Uloží se čas, jednorázově poloha z vašeho telefonu a vzdálenost od adresy zákazníka (a fotka, pokud ji přidáte).
                Polohu nesledujeme průběžně. Záznam uvidí i zákazník. Více v{' '}
                <Link href="/soukromi" className="underline hover:text-slate-700">Zásadách ochrany osobních údajů</Link>.
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm text-slate-600">Příjezd půjde zaznamenat od {view.checkIn.opensText}.</p>
          )}
        </div>
      )}

      {/* ── Záznamy příjezdu (obě strany) ── */}
      {view.checkIns.length > 0 && (
        <div>
          <p className="text-sm font-black text-slate-900">{isProvider ? 'Vaše záznamy příjezdu' : 'Příjezd poskytovatele'}</p>
          <ul className="mt-1.5 space-y-1.5">
            {view.checkIns.map((c) => (
              <li key={c.id} className={`flex items-start gap-3 rounded-xl border px-3 py-2 text-sm ${c.valid ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
                <div className="min-w-0 flex-1">
                  <strong>{c.valid ? 'Na místě' : 'Záznam příjezdu'}</strong> · {c.atText}
                  {c.distanceM != null && c.valid && <> · {c.distanceM.toLocaleString('cs-CZ')} m od adresy</>}
                  {!c.valid && c.issues.length > 0 && <span className="block text-xs opacity-80">Neplatný: {issuesText(c.issues, c.distanceM)}</span>}
                </div>
                {c.photoUrl && (
                  <a href={c.photoUrl} target="_blank" rel="noopener noreferrer" className="shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={c.photoUrl} alt="Fotka z příjezdu" className="h-12 w-12 rounded-lg object-cover" />
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Zákazník: nahlásit nedostavení ── */}
      {!isProvider && !r && view.report?.canNow && (
        !repOpen ? (
          <div>
            <button type="button" onClick={() => { setRepOpen(true); setError('') }}
              className="flex items-center gap-1.5 rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50">
              <AlertTriangle className="h-4 w-4" /> Poskytovatel se nedostavil
            </button>
            <p className="mt-1.5 text-xs text-slate-500">Nahlásit můžete do {view.report.untilText}.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-red-200 bg-red-50/50 p-4">
            <p className="text-sm font-bold text-slate-900">Poskytovatel se nedostavil</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              Poskytovatel se může do 72 hodin vyjádřit. Když s nahlášením souhlasí nebo se nevyjádří, vrátí se vám celá částka {castka} automaticky.
              Když nesouhlasí, peníze se automaticky nehýbou a nárok řešíte přímo s ním – Propojo nerozhoduje, kdo má pravdu.
              {hasValidCheckIn ? ' Poskytovatel má zaznamenaný příjezd na místo – když se nevyjádří, peníze se proto automaticky nevrátí.' : ''}
            </p>
            <label className="mt-3 block text-xs font-semibold text-slate-600">
              Co se stalo <span className="font-normal text-slate-400">(nepovinné)</span>
              <textarea value={repNote} onChange={(e) => setRepNote(e.target.value)} maxLength={1000} rows={2}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-red-300" />
            </label>
            <p className="mt-1 text-xs text-slate-500">
              Nahlášení a reakci poskytovatele evidujeme. Více v{' '}
              <Link href="/soukromi" className="underline hover:text-slate-700">Zásadách ochrany osobních údajů</Link>.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => setRepOpen(false)} disabled={busy}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60">Zpět</button>
              <button type="button" onClick={doReport} disabled={busy}
                className="flex items-center gap-1.5 rounded-xl bg-red-600 px-3 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />} Nahlásit nedostavení
              </button>
            </div>
          </div>
        )
      )}

      {/* ── Nahlášení: stav a reakce ── */}
      {r && r.open && isProvider && (
        <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
          <p className="flex items-center gap-1.5 text-sm font-black text-amber-950"><ShieldQuestion className="h-4 w-4" /> Zákazník hlásí, že jste se nedostavili</p>
          <p className="mt-1 text-sm text-amber-900">Nahlášeno {r.atText}.{r.note ? <> Zpráva: „{r.note}“</> : null}</p>
          <p className="mt-2 text-xs leading-relaxed text-amber-900">
            Vyjádřete se {r.deadlineText ? <>do <strong>{r.deadlineText}</strong></> : 'co nejdřív'}. Když souhlasíte nebo se nevyjádříte, zákazníkovi se z vašeho
            Stripe účtu automaticky vrátí celá částka {castka}.{hasValidCheckIn ? ' Máte zaznamenaný platný příjezd – když se nevyjádříte, peníze se nevrátí, ale zákazník bude nárok řešit přímo s vámi.' : ''}
          </p>
          {!dispOpen ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <button type="button" onClick={() => { setDispOpen(true); setError('') }} disabled={busy}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-slate-800 px-3 py-2.5 text-sm font-bold text-white hover:bg-slate-900 disabled:opacity-60">
                <X className="h-4 w-4" /> Nesouhlasím
              </button>
              <button type="button" onClick={() => doAnswer(true)} disabled={busy}
                className="flex items-center justify-center gap-1.5 rounded-xl border-2 border-amber-300 bg-white px-3 py-2.5 text-sm font-bold text-amber-900 hover:bg-amber-100 disabled:opacity-60">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Souhlasím – vrátit {castka}
              </button>
            </div>
          ) : (
            <div className="mt-3">
              <label className="block text-xs font-semibold text-amber-950">
                Proč nesouhlasíte <span className="font-normal">(uvidí zákazník)</span>
                <textarea value={dispNote} onChange={(e) => setDispNote(e.target.value)} maxLength={1000} rows={3}
                  className="mt-1 w-full rounded-xl border border-amber-300 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500" />
              </label>
              <p className="mt-1 text-xs text-amber-900">Peníze se pak automaticky nehýbou. Propojo nerozhoduje, kdo má pravdu.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={() => setDispOpen(false)} disabled={busy}
                  className="rounded-xl border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-900 disabled:opacity-60">Zpět</button>
                <button type="button" onClick={() => doAnswer(false)} disabled={busy}
                  className="flex items-center gap-1.5 rounded-xl bg-slate-800 px-3 py-2 text-sm font-bold text-white hover:bg-slate-900 disabled:opacity-60">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Odeslat nesouhlas
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {r && r.open && !isProvider && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm leading-relaxed text-amber-900">
          Nedostavení jste nahlásili {r.atText}. Poskytovatel se může vyjádřit {r.deadlineText ? `do ${r.deadlineText}` : 'do 72 hodin'}.
          Když souhlasí nebo se nevyjádří, vrátí se vám celá částka {castka} automaticky.
        </p>
      )}
      {r && !r.open && (
        <div className="rounded-xl bg-slate-50 px-3 py-2.5 text-sm leading-relaxed text-slate-700">
          <p><strong>Nahlášené nedostavení</strong> · {r.atText}{r.note ? <> · „{r.note}“</> : null}</p>
          {r.response?.agree && <p className="mt-1">Poskytovatel nahlášení uznal ({r.response.atText}). {isProvider ? 'Zákazníkovi se vrací' : 'Vrací se vám'} celá částka.</p>}
          {r.response && !r.response.agree && (
            <p className="mt-1">
              Poskytovatel nesouhlasí ({r.response.atText}){r.response.note ? <>: „{r.response.note}“</> : null}. Peníze se automaticky nehýbou
              {isProvider ? ' – zákazník může nárok uplatnit přímo u vás.' : ' – nárok uplatněte přímo u poskytovatele. Propojo nerozhoduje, kdo má pravdu.'}
            </p>
          )}
          {!r.response && r.outcome === 'check_in_conflict' && (
            <p className="mt-1">
              Poskytovatel se nevyjádřil, ale před nahlášením zaznamenal příjezd na místo. Peníze se proto automaticky nevrací
              {isProvider ? ' – zákazník může nárok uplatnit přímo u vás.' : ' – nárok uplatněte přímo u poskytovatele.'}
            </p>
          )}
          {!r.response && r.outcome !== 'check_in_conflict' && r.outcome && (
            <p className="mt-1">Poskytovatel se ve lhůtě nevyjádřil. {isProvider ? 'Zákazníkovi se vrací' : 'Vrací se vám'} celá částka.</p>
          )}
        </div>
      )}

      {info && <p className="text-sm text-slate-700">{info}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
