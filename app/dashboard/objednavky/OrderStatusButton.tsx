'use client'
// components/ui/OrderStatusButton.tsx
// Akce poskytovatele na detailu objednávky.
//
// Tok je zkrácený: zaplacením vzniká potvrzený termín (prijato), takže mezikrok
// „Zahájit / v procesu" nic nepřidával a byl odstraněn. Po zaplacení poskytovatel
// rovnou uzavírá zakázku tlačítkem „Potvrdit pro uvolnění výplaty" → ceka_potvrzeni,
// čímž se u zákazníka objeví potvrzení + hodnocení a spustí se výplata.

import { useState, useEffect } from 'react'
import { Loader2, CheckCircle2, XCircle, Wallet, AlertTriangle, Package, PackageCheck } from 'lucide-react'
import { updateOrderStatus } from '@/lib/actions/orders'
import ItemImageUpload from '@/components/ui/ItemImageUpload'
import { acceptProductOrder, declineProductOrder, getDayLoad, markProductReady, markProductHandedOver } from '@/lib/actions/product-order'
import { AUTO_RELEASE_DAYS, dnyText } from '@/lib/payout-config'

const NEXT_STATUS: Record<string, { status: string; label: string; icon: any; color: string }[]> = {
  cekajici: [
    { status: 'prijato', label: 'Přijmout', icon: CheckCircle2, color: 'text-emerald-600 border-emerald-200 hover:bg-emerald-50' },
    { status: 'zruseno', label: 'Odmítnout', icon: XCircle, color: 'text-red-600 border-red-200 hover:bg-red-50' },
  ],
  // 'prijato' řešíme níž samostatně (hlavní výzva k uzavření), ne v téhle řadě.
}

export default function OrderStatusButton({
  orderId,
  currentStatus,
  depositStatus = null,
  scheduledAt = null,
  durationMinutes = null,
  isProduct = false,
  productQuantity = 1,
  productName = null,
  neededAt = null,
  confirmationDeadline = null,
  serviceItemId = null,
  fulfillmentStatus = null,
  isDelivery = false,
  canAcceptWithoutTime = false,
}: {
  orderId: string
  currentStatus: string
  depositStatus?: string | null
  /** Výrobek má vlastní přijetí/odmítnutí — musí uvolnit rezervovanou zásobu. */
  isProduct?: boolean
  productQuantity?: number
  productName?: string | null
  neededAt?: string | null
  confirmationDeadline?: string | null
  serviceItemId?: string | null
  fulfillmentStatus?: string | null
  isDelivery?: boolean
  /** Model B (výjezd a nacenění) — přijmout jde i bez domluveného termínu. */
  canAcceptWithoutTime?: boolean
  /** Domluvený termín — dřív než nastane, nemá smysl zakázku uzavírat. */
  scheduledAt?: string | null
  /** Délka úkonu v minutách — uzavírat jde až po jejím uplynutí,
      ne hned na začátku termínu (barvení trvá 90 minut). */
  durationMinutes?: number | null
}) {
  const [loading, setLoading] = useState<string | null>(null)
  const [err, setErr] = useState('')
  // Vytížení dne u výroby na objednávku. Kapacita je měkká — jen upozorníme,
  // přijetí nikdy neblokujeme.
  const [dayLoad, setDayLoad] = useState<{ used: number; capacity: number; over: boolean } | null>(null)
  // Nepovinná fotka hotové objednávky — posílá se spolu s „připraveno".
  const [readyPhoto, setReadyPhoto] = useState<string | null>(null)

  useEffect(() => {
    if (!isProduct || currentStatus !== 'cekajici' || !serviceItemId || !neededAt) return
    let cancelled = false
    getDayLoad(serviceItemId, neededAt)
      .then((r) => { if (!cancelled) setDayLoad(r) })
      .catch(() => { /* upozornění je nice-to-have */ })
    return () => { cancelled = true }
  }, [isProduct, currentStatus, serviceItemId, neededAt])

  const handleAction = async (status: string) => {
    setErr('')
    setLoading(status)
    const res = await updateOrderStatus(orderId, status as any)
    if (!res.success) setErr(res.error ?? 'Nepodařilo se změnit stav.')
    setLoading(null)
  }

  // ── VÝROBEK ČEKÁ NA POTVRZENÍ ───────────────────────────────
  // Vlastní akce (ne updateOrderStatus): přijetím se odemkne platba,
  // odmítnutím se uvolní rezervovaná zásoba i kapacita dne.
  if (isProduct && currentStatus === 'cekajici') {
    const denText = neededAt
      ? new Intl.DateTimeFormat('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' })
          .format(new Date(`${neededAt}T00:00:00`))
      : null
    const lhuta = confirmationDeadline
      ? new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })
          .format(new Date(confirmationDeadline))
      : null

    const handleAccept = async () => {
      setErr(''); setLoading('accept')
      const res = await acceptProductOrder(orderId)
      if (!res.success) setErr(res.error ?? 'Nepodařilo se potvrdit.')
      setLoading(null)
    }
    const handleDecline = async () => {
      if (!confirm('Opravdu objednávku odmítnout? Zákazníkovi dáme vědět a nic mu nebudeme účtovat.')) return
      setErr(''); setLoading('decline')
      const res = await declineProductOrder(orderId)
      if (!res.success) setErr(res.error ?? 'Nepodařilo se odmítnout.')
      setLoading(null)
    }

    return (
      <div className="w-full">
        <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50/60 p-4">
          <p className="mb-0.5 text-sm font-bold text-slate-900">Potvrďte objednávku</p>
          <p className="mb-3 text-xs leading-relaxed text-slate-600">
            {productQuantity > 1 ? `${productQuantity}× ` : ''}{productName ?? 'Výrobek'}
            {denText ? <> · zákazník potřebuje <strong className="text-slate-800">{denText}</strong></> : null}
            <br />
            Zákazník zaplatí, až objednávku přijmete.
            {lhuta ? <> Odpovězte prosím do <strong className="text-slate-800">{lhuta}</strong>, jinak objednávka propadne.</> : null}
          </p>
          {dayLoad?.over && (
            <p className="mb-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] leading-relaxed text-amber-800">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Na tento den už máte {dayLoad.used} z běžných {dayLoad.capacity} ks.
                Přijmout můžete i tak — jen ověřte, že to stihnete.
              </span>
            </p>
          )}
          <button
            onClick={handleAccept}
            disabled={!!loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-base font-bold text-white transition hover:bg-emerald-600 disabled:opacity-60"
          >
            {loading === 'accept'
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Potvrzuji…</>
              : <><CheckCircle2 className="h-4 w-4" /> Přijmout objednávku</>}
          </button>
        </div>

        <button
          onClick={handleDecline}
          disabled={!!loading}
          className="mt-2 flex items-center gap-1.5 rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60"
        >
          {loading === 'decline' ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
          Tento termín nemohu splnit
        </button>
        {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
      </div>
    )
  }

  // ── SLUŽBA ČEKÁ NA TERMÍN ───────────────────────────────────
  // Služba (ne výrobek) bez domluveného termínu: nejdřív se musí navrhnout
  // termín. Model B (výjezd a nacenění) termín nemá, proto canAcceptWithoutTime.
  if (currentStatus === 'cekajici' && !scheduledAt && !canAcceptWithoutTime) {
    return (
      <div className="w-full">
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm leading-relaxed text-amber-800">
          Nejdřív zákazníkovi navrhněte termín výše. Objednávka se potvrdí, až si zákazník jeden vybere.
        </p>
        <button
          onClick={() => handleAction('zruseno')}
          disabled={!!loading}
          className="mt-2 flex items-center gap-1.5 rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60"
        >
          {loading === 'zruseno' ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
          Odmítnout objednávku
        </button>
        {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
      </div>
    )
  }

  // Ve stavu "čeká na potvrzení" poskytovatel jen čeká na zákazníka.
  if (currentStatus === 'ceka_potvrzeni') {
    return <p className="text-sm text-slate-500">Čeká se na potvrzení od zákazníka — jakmile potvrdí, převedeme vám platbu.</p>
  }

  // ── VÝROBEK: PŘÍPRAVA → PŘEDÁNÍ ─────────────────────────────
  // Dva samostatné kroky. „Připraveno" NEspouští výplatu — objednávka zůstává
  // 'prijato'. Do 'ceka_potvrzeni' (a tím do dvoudenního automatu) přejde až
  // předáním, aby provider nedostal peníze za nevyzvednuté zboží.
  if (isProduct && currentStatus === 'prijato') {
    const cekaNaPlatbu = depositStatus === 'pending'
    const jePripraveno = fulfillmentStatus === 'ready'
    const slovoPredani = isDelivery ? 'doručeno' : 'předáno'

    const handleReady = async () => {
      setErr(''); setLoading('ready')
      const res = await markProductReady(orderId, readyPhoto)
      if (!res.success) setErr(res.error ?? 'Nepodařilo se uložit.')
      setLoading(null)
    }
    const handleHandover = async () => {
      const otazka = isDelivery
        ? 'Opravdu označit jako doručené? Zákazník pak potvrdí převzetí a uvolní se platba.'
        : 'Opravdu označit jako předané? Zákazník pak potvrdí převzetí a uvolní se platba.'
      if (!confirm(otazka)) return
      setErr(''); setLoading('handover')
      const res = await markProductHandedOver(orderId)
      if (!res.success) setErr(res.error ?? 'Nepodařilo se uložit.')
      setLoading(null)
    }

    if (cekaNaPlatbu) {
      return (
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-500">
          Zákazník ještě neuhradil objednávku. Jakmile zaplatí, dáme vám vědět a můžete začít připravovat.
        </p>
      )
    }

    return (
      <div className="w-full">
        <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50/60 p-4">
          <p className="mb-0.5 text-sm font-bold text-slate-900">
            {jePripraveno
              ? (isDelivery ? 'Objednávka čeká na doručení' : 'Objednávka čeká na vyzvednutí')
              : 'Připravujete objednávku'}
          </p>
          <p className="mb-3 text-xs leading-relaxed text-slate-600">
            {jePripraveno
              ? <>Zákazníkovi jsme dali vědět. Až si zboží {isDelivery ? 'převezme při doručení' : 'vyzvedne'}, potvrďte to — teprve tím se spustí výplata.</>
              : 'Až bude objednávka hotová, dejte zákazníkovi vědět. Výplata se spustí až po předání.'}
          </p>

          {!jePripraveno && (
            <div className="mb-3">
              <p className="mb-1.5 text-xs font-semibold text-slate-600">
                Fotka hotové objednávky <span className="font-normal text-slate-400">(nepovinné)</span>
              </p>
              <ItemImageUpload value={readyPhoto} onChange={setReadyPhoto} folder="orders" />
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                Zákazník ji uvidí u objednávky. U dortů a zakázkové výroby potěší.
              </p>
            </div>
          )}

          {!jePripraveno ? (
            <button
              onClick={handleReady}
              disabled={!!loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-base font-bold text-white transition hover:bg-emerald-600 disabled:opacity-60"
            >
              {loading === 'ready'
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Ukládám…</>
                : <><Package className="h-4 w-4" /> Objednávka je připravená</>}
            </button>
          ) : (
            <button
              onClick={handleHandover}
              disabled={!!loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-base font-bold text-white transition hover:bg-emerald-600 disabled:opacity-60"
            >
              {loading === 'handover'
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Ukládám…</>
                : <><PackageCheck className="h-4 w-4" /> Označit jako {slovoPredani}</>}
            </button>
          )}

          {jePripraveno && (
            <p className="mt-2 text-center text-[11px] leading-relaxed text-slate-400">
              Po předání zákazník potvrdí převzetí — pak převod spustíme hned, jinak automaticky do {dnyText(AUTO_RELEASE_DAYS)}.
            </p>
          )}
        </div>

        <button
          onClick={() => handleAction('zruseno')}
          disabled={!!loading}
          className="mt-2 flex items-center gap-1.5 rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60"
        >
          {loading === 'zruseno' ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
          Zrušit objednávku
        </button>
        {depositStatus === 'paid' && (
          <p className="mt-1 text-xs text-slate-400">Při zrušení se zákazníkovi vrátí zaplacená částka.</p>
        )}
        {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
      </div>
    )
  }

  // ── HLAVNÍ VÝZVA K UZAVŘENÍ (po zaplacení) ──────────────────
  // Zaplacená a přijatá zakázka: poskytovatel po dokončení práce uzavře.
  // Výrazná zelená výzva, ať je jasné, že tohle spouští výplatu.
  if (currentStatus === 'prijato') {
    const waitingForDeposit = depositStatus === 'pending'
    // Uzavřít dává smysl až v den a hodinu, kdy se má služba odehrát.
    // Dřív by poskytovatel uzavíral práci, která ještě neproběhla.
    // Počítáme KONEC služby, ne začátek — jinak by šlo uzavřít barvení
    // ve chvíli, kdy zákaznice teprve usedla do křesla.
    const konecSluzby = scheduledAt
      ? new Date(new Date(scheduledAt).getTime() + (durationMinutes ?? 0) * 60_000)
      : null
    const terminNastal = !konecSluzby || konecSluzby.getTime() <= Date.now()
    const terminText = konecSluzby
      ? new Intl.DateTimeFormat('cs-CZ', { weekday: 'long', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }).format(konecSluzby)
      : null

    if (waitingForDeposit) {
      // Stav „čeká se na úhradu" hlásí už pruh nad tlačítky (OrderDetailClient),
      // tady bychom ho psali podruhé. Zobrazíme jen to, co má poskytovatel udělat.
      return (
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-500">
          Zakázku půjde uzavřít, jakmile zákazník zaplatí. Do té doby není z čeho vyplatit.
        </p>
      )
    }

    if (!terminNastal) {
      return (
        <div className="w-full">
          <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
            Zakázku uzavřete <strong className="text-slate-800">po skončení služby</strong>
            {terminText ? <> — {terminText}</> : null}. Do té doby není co potvrzovat.
          </p>
          <button
            onClick={() => handleAction('zruseno')}
            disabled={!!loading}
            className="mt-2 flex items-center gap-1.5 rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60"
          >
            {loading === 'zruseno' ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
            Zrušit zakázku
          </button>
          {depositStatus === 'paid' && (
            <p className="mt-1 text-xs text-slate-400">Při zrušení se zákazníkovi vrátí zaplacená částka.</p>
          )}
          {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
        </div>
      )
    }

    return (

      <div className="w-full">

        <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50/60 p-4">
          <p className="mb-0.5 text-sm font-bold text-slate-900">Až budete s prací hotovi</p>
          <p className="mb-3 text-xs leading-relaxed text-slate-600">
            Klepnutím uzavřete zakázku a spustíte výplatu. Zákazník pak potvrdí a ohodnotí.
          </p>
          <button
            onClick={() => handleAction('ceka_potvrzeni')}
            disabled={!!loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-base font-bold text-white transition hover:bg-emerald-600 disabled:opacity-60"
          >
            {loading === 'ceka_potvrzeni'
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Potvrzuji…</>
              : <><Wallet className="h-4 w-4" /> Potvrdit pro uvolnění výplaty</>}
          </button>
          <p className="mt-2 text-center text-[11px] leading-relaxed text-slate-400">
            Pošleme peníze na váš účet. Když zákazník potvrdí, převod se spustí hned — jinak automaticky do {dnyText(AUTO_RELEASE_DAYS)}.
          </p>
        </div>

        {/* Zrušení zůstává dostupné i tady, ale nenápadně. */}
        <button
          onClick={() => handleAction('zruseno')}
          disabled={!!loading}
          className="mt-2 flex items-center gap-1.5 rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60"
        >
          {loading === 'zruseno' ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
          Zrušit zakázku
        </button>
        {depositStatus === 'paid' && (
          <p className="mt-1 text-xs text-slate-400">Při zrušení se zákazníkovi vrátí zaplacená částka.</p>
        )}
        {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
      </div>
    )
  }

  // ── Ostatní stavy (cekajici): přijmout / odmítnout ──────────
  const actions = NEXT_STATUS[currentStatus] ?? []
  if (actions.length === 0) return null

  return (
    <div className="w-full">
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <button
            key={action.status}
            onClick={() => handleAction(action.status)}
            disabled={!!loading}
            className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold transition-all ${action.color}`}
          >
            {loading === action.status
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <action.icon className="h-4 w-4" />}
            {action.label}
          </button>
        ))}
      </div>
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
    </div>
  )
}