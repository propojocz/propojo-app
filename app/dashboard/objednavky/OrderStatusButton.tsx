'use client'
// app/dashboard/objednavky/OrderStatusButton.tsx
// Akce poskytovatele na detailu objednávky.
//
// Tok je zkrácený: zaplacením vzniká potvrzený termín (prijato), takže mezikrok
// „Zahájit / v procesu" nic nepřidával a byl odstraněn. Po zaplacení poskytovatel
// rovnou uzavírá zakázku tlačítkem „Potvrdit pro uvolnění výplaty" → ceka_potvrzeni,
// čímž se u zákazníka objeví potvrzení + hodnocení a spustí se výplata.

import { useState, useEffect } from 'react'
import { Loader2, CheckCircle2, XCircle, Wallet, UserX } from 'lucide-react'
import { updateOrderStatus } from '@/lib/actions/orders'
import { setAttendance } from '@/lib/actions/day-schedule'

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
  attendance = null,
  noShowFee = null,
}: {
  orderId: string
  currentStatus: string
  depositStatus?: string | null
  /** Kdy má termín proběhnout — po něm dává smysl řešit nedostavení. */
  scheduledAt?: string | null
  /** 'dorazil' | 'jinak' | 'nedorazil' | null */
  attendance?: string | null
  /** Nastavený poplatek za nedostavení (Kč). Modal ho přednabídne, jde snížit. */
  noShowFee?: number | null
}) {
  const [loading, setLoading] = useState<string | null>(null)
  const [err, setErr] = useState('')

  // Chybová hláška patří k jednomu pokusu — při změně stavu objednávky
  // (např. po přijetí) stará hláška „nejdřív navrhněte termín" nemá viset dál.
  useEffect(() => { setErr('') }, [currentStatus])

  // Modal potvrzení nedostavení — poskytovatel může poplatek snížit.
  const [noShowModal, setNoShowModal] = useState(false)
  const [feeValue, setFeeValue] = useState<number>(Number(noShowFee ?? 0))

  const openNoShow = () => {
    setFeeValue(Number(noShowFee ?? 0))
    setNoShowModal(true)
  }

  const confirmNoShow = async () => {
    setErr('')
    setLoading('noshow')
    const res = await setAttendance(orderId, 'nedorazil', feeValue)
    if (!res.success) { setErr(res.error ?? 'Nepodařilo se uložit.'); setLoading(null); return }
    setNoShowModal(false)
    setLoading(null)
  }

  const handleAction = async (status: string) => {
    setErr('')
    setLoading(status)
    const res = await updateOrderStatus(orderId, status as any)
    if (!res.success) setErr(res.error ?? 'Nepodařilo se změnit stav.')
    setLoading(null)
  }

  // Ve stavu "čeká na potvrzení" poskytovatel jen čeká na zákazníka.
  if (currentStatus === 'ceka_potvrzeni') {
    return <p className="text-sm text-slate-500">Čeká se na potvrzení od zákazníka — jakmile potvrdí, převedeme vám platbu.</p>
  }

  // ── HLAVNÍ VÝZVA K UZAVŘENÍ (po zaplacení) ──────────────────
  // Zaplacená a přijatá zakázka: poskytovatel po dokončení práce uzavře.
  // Výrazná zelená výzva, ať je jasné, že tohle spouští výplatu.
  if (currentStatus === 'prijato') {
    const waitingForDeposit = depositStatus === 'pending'
    // Po termínu dává smysl nabídnout i „nedorazil". Před ním ne — zákazník
    // ještě může přijít.
    const poTerminu = !!scheduledAt && new Date(scheduledAt).getTime() < Date.now()

    // Už označeno jako nedostavení — běží 24 h na námitku, poskytovatel jen čeká.
    if (attendance === 'nedorazil') {
      return (
        <div className="rounded-2xl border-2 border-red-200 bg-red-50/60 p-4">
          <p className="mb-0.5 flex items-center gap-2 text-sm font-bold text-slate-900">
            <UserX className="h-4 w-4 text-red-600" /> Označeno: zákazník nedorazil
          </p>
          <p className="text-xs leading-relaxed text-slate-600">
            Dali jsme mu vědět. Má 24 hodin na námitku — pak vám převedeme poplatek za nedostavení
            (máte-li ho u úkonu nastavený) a zbytek se zákazníkovi vrátí. Nemusíte nic dělat.
          </p>
        </div>
      )
    }

    if (waitingForDeposit) {
      return (
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-500">
          Čeká se na úhradu zálohy od zákazníka. Jakmile zaplatí, budete moct zakázku po dokončení uzavřít.
        </p>
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
            Pošleme peníze na váš účet. Když zákazník potvrdí, převod se spustí hned — jinak nejpozději do 7 dnů.
          </p>

          {/* Zákazník nepřišel — druhá možnost, jak zakázku uzavřít. Nabízí se
              až po termínu, dřív by nedávala smysl. */}
          {poTerminu && (
            <button
              onClick={openNoShow}
              disabled={!!loading}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60"
            >
              {loading === 'noshow'
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Ukládám…</>
                : <><UserX className="h-4 w-4" /> Zákazník nedorazil</>}
            </button>
          )}

          {/* Modal: potvrzení nedostavení s možností poplatek snížit. */}
          {noShowModal && (
            <div
              className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4"
              onClick={() => setNoShowModal(false)}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-md rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl"
              >
                <div className="mb-2 flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-red-100">
                    <UserX className="h-5 w-5 text-red-600" />
                  </div>
                  <h3 className="text-lg font-black text-slate-900">Zákazník nedorazil</h3>
                </div>
                <p className="mb-4 text-sm leading-relaxed text-slate-500">
                  Dáme zákazníkovi vědět a bude mít 24 hodin na námitku. Pak vám převedeme
                  poplatek a zbytek se mu vrátí — nemusíte nic dalšího řešit.
                </p>

                {Number(noShowFee ?? 0) > 0 ? (
                  <div className="mb-4">
                    <label className="mb-1 block text-xs font-semibold text-slate-600">
                      Kolik si naúčtovat (Kč)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={Number(noShowFee ?? 0)}
                      value={feeValue}
                      onChange={(e) => {
                        const n = Math.max(0, Math.min(Number(e.target.value) || 0, Number(noShowFee ?? 0)))
                        setFeeValue(n)
                      }}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-red-400"
                    />
                    <div className="mt-2 flex items-center justify-between text-xs">
                      <span className="text-slate-400">Váš nastavený poplatek: {Number(noShowFee ?? 0).toLocaleString('cs-CZ')} Kč</span>
                      <button
                        type="button"
                        onClick={() => setFeeValue(0)}
                        className="font-semibold text-slate-500 underline hover:text-slate-700"
                      >
                        Odpustit celý
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="mb-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                    U tohoto úkonu nemáte nastavený žádný poplatek — zákazníkovi se vrátí celá záloha.
                  </p>
                )}

                {err && <p className="mb-3 text-sm text-red-600">{err}</p>}

                <div className="flex gap-2">
                  <button
                    onClick={() => setNoShowModal(false)}
                    className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Zpět
                  </button>
                  <button
                    onClick={confirmNoShow}
                    disabled={loading === 'noshow'}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-red-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-red-600 disabled:opacity-60"
                  >
                    {loading === 'noshow'
                      ? <><Loader2 className="h-4 w-4 animate-spin" /> Ukládám…</>
                      : 'Potvrdit'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Zrušení nedává smysl, když je označené nedostavení — čeká se na vyřízení. */}
        {attendance !== 'nedorazil' && (
          <>
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
          </>
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