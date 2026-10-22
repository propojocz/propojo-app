'use client'
// components/ui/BookingOnSite.tsx
// Vrstva 6 (22. 10. 2026): výjezd na místě – v detailu rezervace pod příjezdem.
// - poskytovatel po platném příjezdu: „Nemůžu vás zastihnout“ (zpráva + oznámení zákazníkovi),
//   po 15 minutách „Zákazník nezastižen“ (jen záznam, peníze se nehýbou);
// - poskytovatel: nahrát doklad Závazné nabídky (foto / PDF) – jen důkaz, penězi nehýbe (model §5);
// - obě strany vidí záznam „nezastižen“ a nahrané nabídky.

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Loader2, PhoneOff, Upload, UserX } from 'lucide-react'
import { contactCustomerFromSite, customerNotReached, quoteProofTarget, saveQuoteProof } from '@/lib/actions/booking'
import { createClient } from '@/lib/supabase/client'
import { resizeImage } from '@/lib/image-resize'

export type OnSiteView = {
  notReached: {
    canContact: boolean
    canMark: boolean
    markFromText: string | null
    contactTexts: string[]
    notReachedText: string | null
  } | null
  proofs: Array<{ id: string; url: string | null; isPdf: boolean; name: string; atText: string }>
  canUploadProof: boolean
}

export default function BookingOnSite({ orderId, isProvider, view }: { orderId: string; isProvider: boolean; view: OnSiteView }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const nr = view.notReached

  const run = async (fn: () => Promise<{ success: true } | { success: false; error: string }>) => {
    setBusy(true); setError('')
    const res = await fn()
    setBusy(false)
    if (!res.success) setError(res.error)
    else router.refresh()
  }

  const upload = async (file: File) => {
    setBusy(true); setError('')
    try {
      const isPdf = file.type === 'application/pdf'
      // Fotky zmenšit (rychlé nahrání z telefonu); PDF beze změny
      const prepared = isPdf ? { blob: file as Blob, contentType: 'application/pdf' } : await resizeImage(file, 2000, 0.85)
      if (prepared.blob.size > 10 * 1024 * 1024) { setError('Soubor je větší než 10 MB.'); return }
      const target = await quoteProofTarget(orderId, prepared.contentType)
      if (!target.success) { setError(target.error); return }
      const { error: upErr } = await createClient().storage.from('quote-proofs')
        .uploadToSignedUrl(target.path, target.token, prepared.blob, { contentType: prepared.contentType })
      if (upErr) { setError('Soubor se nepodařilo nahrát. Zkuste to prosím znovu.'); return }
      const res = await saveQuoteProof(orderId, target.path, prepared.contentType, file.name)
      if (!res.success) { setError(res.error); return }
      router.refresh()
    } catch {
      setError('Soubor se nepodařilo zpracovat. Zkuste fotku ve formátu JPG nebo PDF.')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const showNotReached = !!nr && (nr.notReachedText || (isProvider && (nr.canContact || nr.contactTexts.length > 0)) || (!isProvider && nr.contactTexts.length > 0))
  if (!showNotReached && view.proofs.length === 0 && !(isProvider && view.canUploadProof)) return null

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      {/* ── Zákazník nezastižen ── */}
      {showNotReached && nr && (
        <div>
          {nr.notReachedText ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm leading-relaxed text-amber-900">
              <strong>Zákazník nezastižen</strong> · {nr.notReachedText}.{' '}
              {isProvider
                ? 'Cena výjezdu se automaticky nevrací. Kdyby se zákazník ozval, domluvte se s ním přímo.'
                : 'Cena výjezdu se automaticky nevrací. Pokud máte za to, že vám část nebo celá částka náleží, obraťte se přímo na poskytovatele.'}
            </p>
          ) : (
            <>
              {nr.contactTexts.length > 0 && (
                <p className="text-sm text-slate-700">
                  {isProvider ? 'Zpráva „Nemůžu vás zastihnout“ odeslána' : 'Poskytovatel je u vás a nemůže vás zastihnout – ozvěte se mu'} · {nr.contactTexts.join(', ')}
                </p>
              )}
              {isProvider && nr.canContact && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" disabled={busy} onClick={() => run(() => contactCustomerFromSite(orderId))}
                    className="flex items-center gap-1.5 rounded-xl border border-orange-300 bg-white px-3 py-2 text-sm font-semibold text-orange-800 hover:bg-orange-50 disabled:opacity-60">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PhoneOff className="h-4 w-4" />} Nemůžu vás zastihnout
                  </button>
                  <button type="button" disabled={busy || !nr.canMark}
                    onClick={() => { if (confirm('Zaznamenat, že jste zákazníka nezastihli? Zákazník dostane e-mail.')) void run(() => customerNotReached(orderId)) }}
                    className="flex items-center gap-1.5 rounded-xl bg-slate-800 px-3 py-2 text-sm font-bold text-white hover:bg-slate-900 disabled:opacity-40">
                    <UserX className="h-4 w-4" /> Zákazník nezastižen
                  </button>
                </div>
              )}
              {isProvider && nr.canContact && !nr.canMark && (
                <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
                  Zákazníka nejde zastihnout? Pošlete mu zprávu „Nemůžu vás zastihnout“.
                  „Zákazník nezastižen“ půjde zaznamenat {nr.markFromText ? `od ${nr.markFromText}` : '15 minut po příjezdu'} (aspoň 15 minut čekání po příjezdu a jedna zpráva).
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Doklad Závazné nabídky ── */}
      {(view.proofs.length > 0 || (isProvider && view.canUploadProof)) && (
        <div>
          <p className="text-sm font-black text-slate-900">Závazná nabídka</p>
          {view.proofs.length > 0 ? (
            <ul className="mt-1.5 flex flex-wrap gap-2">
              {view.proofs.map((p) => (
                <li key={p.id}>
                  <a href={p.url ?? '#'} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-700 hover:border-slate-300">
                    {p.isPdf || !p.url
                      ? <FileText className="h-8 w-8 text-slate-400" />
                      // eslint-disable-next-line @next/next/no-img-element
                      : <img src={p.url} alt="Nabídka" className="h-10 w-10 rounded-lg object-cover" />}
                    <span><span className="block max-w-[160px] truncate font-semibold">{p.name}</span>{p.atText}</span>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-0.5 text-xs text-slate-500">Zatím nic nenahráno.</p>
          )}
          {isProvider && view.canUploadProof && (
            <>
              <button type="button" disabled={busy} onClick={() => fileRef.current?.click()}
                className="mt-2 flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Nahrát nabídku (foto nebo PDF)
              </button>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f) }} />
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                Nahrajte nabídku, kterou jste zákazníkovi po prohlídce předali – slouží jako doklad, že jste nacenění dodali.
                Propojo ji neposuzuje a penězi nehýbe. Uvidí ji i zákazník.
              </p>
            </>
          )}
          {!isProvider && view.proofs.length > 0 && (
            <p className="mt-1 text-xs text-slate-500">Nabídku nahrál poskytovatel jako doklad. Smlouvu o zakázce uzavíráte přímo s ním.</p>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
