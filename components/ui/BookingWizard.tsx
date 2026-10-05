'use client'
// components/ui/BookingWizard.tsx
// Model v2: jedno přehledové okno před platbou – co, kdy, kde, s kým, kolik.
// Kontakt poskytovatele zákazník poprvé vidí tady (model §15). Výjezd: žádost o provedení
// před uplynutím lhůty, výrobek na míru: potvrzení, že odstoupit nejde (VOP čl. 9).
// Zásada: minimalisticky, podrobnosti pod ⓘ – kdo chce, dočte se; kdo spěchá, proletí.
// Termín se zablokuje až tlačítkem platby; přímou rezervaci drží krátký zámek s odpočtem.

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { CalendarDays, Info, Loader2, MapPin, ShieldCheck, User, X } from 'lucide-react'
import AddressInput from '@/components/ui/AddressInput'
import { getBookingRecap, startBookingPayment, type BookingRecap } from '@/lib/actions/booking'
import { acceptProposal } from '@/lib/actions/time-proposals'
import { setOrderAddress } from '@/lib/actions/orders'
import { releaseUnpaidReservation } from '@/lib/actions/reservation-release'
import { cas, terminDlouze } from '@/lib/format'

export default function BookingWizard({
  orderId,
  proposal = null,
  onClose,
}: {
  orderId: string
  /** Zákazník přijímá navržený termín – přijme se až tlačítkem platby. Bez něj platí termín objednávky. */
  proposal?: { starts_at: string; ends_at: string } | null
  onClose: () => void
}) {
  const router = useRouter()
  const [recap, setRecap] = useState<BookingRecap | null>(null)
  const [loadError, setLoadError] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [consent, setConsent] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const [showWhy, setShowWhy] = useState(false)

  // Adresa: předvyplněná, změna jen na požádání
  const [editAddress, setEditAddress] = useState(false)
  const [addrText, setAddrText] = useState('')
  const [addrCoords, setAddrCoords] = useState<{ lat: number | null; lng: number | null }>({ lat: null, lng: null })

  // Odpočet zámku přímé rezervace
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    let cancelled = false
    getBookingRecap(orderId, proposal?.starts_at ?? null).then((res) => {
      if (cancelled) return
      if (!res.success) { setLoadError(res.error); return }
      setRecap(res.recap)
      const a = res.recap.address ?? res.recap.suggestedAddress
      setAddrText(a?.text ?? '')
      setAddrCoords({ lat: a?.lat ?? null, lng: a?.lng ?? null })
      setEditAddress(res.recap.atCustomer && !a)
    })
    return () => { cancelled = true }
  }, [orderId, proposal?.starts_at])

  useEffect(() => {
    if (!recap?.holdExpiresAt || proposal) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [recap?.holdExpiresAt, proposal])

  const start = proposal?.starts_at ?? recap?.scheduledAt ?? null
  const end = proposal?.ends_at ?? recap?.scheduledEnd ?? null
  const terminText = start
    ? (recap?.arrivalWindow && end ? `${terminDlouze(start)}–${cas(end)}` : terminDlouze(start))
    : '—'

  const holdLeftMs = recap?.holdExpiresAt && !proposal ? new Date(recap.holdExpiresAt).getTime() - now : null
  const holdExpired = holdLeftMs !== null && holdLeftMs <= 0
  const holdText = holdLeftMs !== null && holdLeftMs > 0
    ? `${Math.floor(holdLeftMs / 60000)}:${String(Math.floor((holdLeftMs % 60000) / 1000)).padStart(2, '0')}`
    : null

  /** Uloží adresu, pokud je nová nebo změněná. Vrací false při chybě. */
  const saveAddressIfNeeded = async (): Promise<boolean> => {
    if (!recap || !recap.atCustomer) return true
    if (addrText.trim().length < 5) { setError('Doplňte prosím adresu (ulice a číslo).'); return false }
    if (recap.addressRequiresCoords && (addrCoords.lat == null || addrCoords.lng == null)) {
      setError('Vyberte prosím adresu ze seznamu, ať poskytovatel ví přesně, kam přijet.')
      return false
    }
    if (recap.address && recap.address.text === addrText.trim()) return true
    const res = await setOrderAddress(orderId, addrText, addrCoords)
    if (!res.success) { setError(res.error ?? 'Adresu se nepodařilo uložit.'); return false }
    setRecap({ ...recap, address: { text: addrText.trim(), lat: addrCoords.lat, lng: addrCoords.lng } })
    return true
  }

  const pay = async () => {
    if (!recap) return
    if (recap.consentText && !consent) { setError('Pro pokračování prosím zaškrtněte políčko.'); return }
    setBusy(true); setError('')
    if (!(await saveAddressIfNeeded())) { setBusy(false); return }
    if (proposal) {
      const acc = await acceptProposal(orderId, proposal.starts_at)
      if (!acc.success) { setError(acc.error); setBusy(false); return }
    }
    const res = await startBookingPayment(orderId, consent)
    if (res.success) {
      window.location.href = res.url
      return
    }
    if (proposal) {
      // Termín se přijal, ale platba nešla spustit – vrátíme objednávku do domluvy.
      await releaseUnpaidReservation(orderId, 'checkout_failed')
    }
    setError(res.error)
    setBusy(false)
    router.refresh()
  }

  const chooseAgain = async () => {
    setBusy(true)
    await releaseUnpaidReservation(orderId, 'change_term')
    if (recap?.serviceId) router.push(`/sluzby/${recap.serviceId}`)
    else router.refresh()
    onClose()
  }

  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-900/40 sm:items-center sm:p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[95vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:max-w-md sm:rounded-2xl"
      >
        {/* Hlavička */}
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
          <p className="font-black text-slate-900">Shrnutí a platba</p>
          <div className="flex items-center gap-2">
            {holdText && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700" title="Do kdy pro vás termín držíme">
                {holdText}
              </span>
            )}
            <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100" aria-label="Zavřít">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Obsah */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loadError ? (
            <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{loadError}</p>
          ) : !recap ? (
            <div className="flex items-center gap-2 py-6 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Načítám…</div>
          ) : holdExpired ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-800">
              <p className="font-bold">Čas na dokončení vypršel</p>
              <p className="mt-1">Termín jsme uvolnili. Vyberte ho prosím znovu, nic vám nebylo strženo.</p>
              <button type="button" onClick={chooseAgain} disabled={busy} className="btn-primary mt-3 w-full justify-center disabled:opacity-60">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Vybrat termín znovu'}
              </button>
            </div>
          ) : (
            <div className="space-y-3 text-sm">
              {/* Co, kdy, kde, s kým */}
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                <p className="px-3.5 py-3 font-black text-slate-900">{recap.itemName}</p>

                <p className="flex items-start gap-2 px-3.5 py-2.5 text-slate-700">
                  <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  <span>
                    {terminText}
                    {recap.arrivalWindow && <span className="block text-xs text-slate-400">Poskytovatel přijede v tomto rozmezí</span>}
                  </span>
                </p>

                <div className="flex items-start gap-2 px-3.5 py-2.5 text-slate-700">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  {recap.atCustomer ? (
                    editAddress ? (
                      <div className="min-w-0 flex-1">
                        <AddressInput
                          defaultValue={addrText}
                          placeholder={recap.arrivalWindow ? 'Kam má poskytovatel přijet? Vyberte ze seznamu…' : 'Adresa – vyberte ze seznamu…'}
                          onPick={(a) => { setAddrText(a.address); setAddrCoords({ lat: a.lat, lng: a.lng }); setError('') }}
                          onFreeText={(t) => { setAddrText(t); setAddrCoords({ lat: null, lng: null }) }}
                        />
                      </div>
                    ) : (
                      <span className="min-w-0 flex-1">
                        {addrText}
                        <button type="button" onClick={() => { setEditAddress(true); setError('') }} className="ml-2 text-xs font-semibold text-emerald-700 underline">
                          Změnit
                        </button>
                      </span>
                    )
                  ) : (
                    <span>{recap.placeText ?? '—'}</span>
                  )}
                </div>

                <p className="flex items-start gap-2 px-3.5 py-2.5 text-slate-700">
                  <User className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  <span>
                    {recap.provider.name}
                    {(recap.provider.phone || recap.provider.email) && (
                      <span className="block text-xs text-slate-500">
                        {[recap.provider.phone, recap.provider.email].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </span>
                </p>
              </div>

              {/* Kolik + jedna věta, zbytek pod ⓘ */}
              <div className="rounded-xl bg-emerald-50 px-3.5 py-3">
                <div className="flex items-baseline justify-between">
                  <span className="font-semibold text-slate-700">{recap.paymentLabel}</span>
                  <span className="text-lg font-black text-slate-900">
                    {recap.originalChargeKc != null && (
                      <span className="mr-1.5 text-sm font-semibold text-slate-400 line-through">{recap.originalChargeKc.toLocaleString('cs-CZ')} Kč</span>
                    )}
                    {recap.chargeKc.toLocaleString('cs-CZ')} Kč
                  </span>
                </div>
                {recap.originalChargeKc != null && (
                  <p className="mt-0.5 text-xs text-slate-600">
                    Cenu upravil poskytovatel{recap.priceNote ? <> – {recap.priceNote}</> : null}.
                  </p>
                )}
                <p className="mt-1 flex items-start gap-1.5 text-xs leading-relaxed text-slate-600">
                  <span className="flex-1">
                    {recap.paymentShort}
                    {recap.deductionNote && <span className="mt-0.5 block font-semibold text-slate-700">{recap.deductionNote}</span>}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowInfo((v) => !v)}
                    className="shrink-0 text-emerald-700"
                    aria-label="Co přesně platím"
                    title="Co přesně platím"
                  >
                    <Info className="h-4 w-4" />
                  </button>
                </p>
                {showInfo && (
                  <ul className="mt-2 list-disc space-y-1 border-t border-emerald-100 pl-5 pt-2 text-xs leading-relaxed text-slate-600">
                    <li>{recap.paymentMeaning}</li>
                    {recap.withdrawalNote && <li>{recap.withdrawalNote}</li>}
                    {recap.cancellationRules.map((r) => <li key={r}>{r}</li>)}
                    <li>{recap.paymentNote}</li>
                  </ul>
                )}
              </div>

              {/* Výjezd / výrobek na míru: povinné potvrzení podle VOP čl. 9 */}
              {recap.consentText && (
                <label className="flex items-start gap-2.5 rounded-xl border border-slate-200 p-3">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => { setConsent(e.target.checked); setError('') }}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-600"
                  />
                  <span className="text-slate-700">
                    {recap.consentText}
                    {recap.consentWhy && (
                      <button type="button" onClick={(e) => { e.preventDefault(); setShowWhy((v) => !v) }} className="ml-1 inline-flex align-middle text-emerald-700" aria-label="Proč?">
                        <Info className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {showWhy && recap.consentWhy && <span className="mt-1 block text-xs text-slate-500">{recap.consentWhy}</span>}
                  </span>
                </label>
              )}
            </div>
          )}

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </div>

        {/* Tlačítko */}
        {recap && !loadError && !holdExpired && (
          <div className="border-t border-slate-100 px-5 py-3">
            <button type="button" onClick={pay} disabled={busy} className="btn-primary w-full justify-center disabled:opacity-60">
              {busy
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Otevírám platbu…</>
                : <><ShieldCheck className="h-4 w-4" /> {recap.submitLabel}</>}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
