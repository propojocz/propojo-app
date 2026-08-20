'use client'
// app/dashboard/terminy/TerminyClient.tsx
// Poskytovatel: přidá volné okno (den, od-do) a zaškrtne KARTY, jejichž ceník
// se do okna nabídne. Zákazník pak v ceníku vybere konkrétní úkon, který se
// do okna vejde délkou.
//
// Po vytvoření okna se hned na místě otevře „Komu dát vědět?" — rozeslání
// stálým zákazníkům, oblíbeným a čekajícím + sdílecí odkaz do story.
//
// Zabrané okno je klikací — vede na detail objednávky, ať poskytovatel hned
// vidí, kdo přijde a na co.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CalendarDays, Clock, Plus, Trash2, Loader2, Info, CheckCircle2, ListChecks, UserPlus, XCircle, ChevronRight } from 'lucide-react'
import { createSlot, deleteSlot, confirmRemainder, dismissRemainder } from '@/lib/actions/slots'
import SlotNotifyPanel from '@/components/ui/SlotNotifyPanel'
import ShareSlotButton from '@/components/ui/ShareSlotButton'

type ServiceLite = {
  id: string
  title: string
  /** Kolik zveřejněných úkonů s pevnou cenou karta má (délka patří úkonu, ne kartě). */
  itemCount: number
  /** Nejkratší úkon v minutách — poskytovatel podle něj pozná, jak krátké okno má smysl. */
  shortestMinutes: number | null
}

type SlotRow = {
  id: string
  starts_at: string
  ends_at: string
  status: string
  /** Zbytek okna po rezervaci — čeká, až poskytovatel řekne, jestli ho nabídnout dál. */
  pending_confirm?: boolean | null
  /** Objednávka, která okno zabrala — odkaz na její detail. */
  order_id?: string | null
  slot_services: { service_id: string; services: { title: string } | null }[]
}

export default function TerminyClient({
  services, slots, preselectedServiceId,
}: {
  services: ServiceLite[]
  slots: SlotRow[]
  preselectedServiceId?: string
}) {
  const router = useRouter()
  const [date, setDate] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [checked, setChecked] = useState<string[]>(
    preselectedServiceId && services.some((s) => s.id === preselectedServiceId) ? [preselectedServiceId] : []
  )
  const preselectedName = services.find((s) => s.id === preselectedServiceId)?.title ?? null
  const [busy, setBusy] = useState(false)
  const [delId, setDelId] = useState<string | null>(null)
  const [err, setErr] = useState('')
  // Právě vytvořené okno — otevře panel „Komu dát vědět?"
  const [createdSlot, setCreatedSlot] = useState<{ id: string; label: string } | null>(null)
  // Zbytek okna, o kterém se právě rozhoduje
  const [remBusy, setRemBusy] = useState<string | null>(null)

  const toggle = (id: string) =>
    setChecked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  // Zbytky po rezervaci čekající na rozhodnutí řešíme zvlášť nahoře.
  const pendingSlots = slots.filter((s) => s.pending_confirm === true && s.status === 'volno')
  const normalSlots = slots.filter((s) => !(s.pending_confirm === true && s.status === 'volno'))

  const fmtDay = (iso: string) =>
    new Intl.DateTimeFormat('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric' }).format(new Date(iso))
  const fmtTime = (iso: string) =>
    new Intl.DateTimeFormat('cs-CZ', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso))

  const submit = async () => {
    setErr('')
    setCreatedSlot(null)
    if (!date || !from || !to) { setErr('Vyplňte den a čas od–do.'); return }
    if (checked.length === 0) { setErr('Zaškrtněte alespoň jednu kartu, jejíž ceník se do okna nabídne.'); return }
    setBusy(true)

    const startsAt = new Date(`${date}T${from}:00`)
    const endsAt = new Date(`${date}T${to}:00`)

    const res = await createSlot({
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      service_ids: checked,
    })

    if (res.success && res.id) {
      const label = `${fmtDay(startsAt.toISOString())} ${fmtTime(startsAt.toISOString())}–${fmtTime(endsAt.toISOString())}`
      setCreatedSlot({ id: res.id, label })
      setDate(''); setFrom(''); setTo(''); setChecked([])
      router.refresh()
    } else if (!res.success) {
      setErr(res.error)
    }
    setBusy(false)
  }

  const decideRemainder = async (id: string, accept: boolean, label: string) => {
    setRemBusy(id)
    const res = accept ? await confirmRemainder(id) : await dismissRemainder(id)
    setRemBusy(null)
    if (!res.success) { alert(res.error); return }
    router.refresh()
    // Po zveřejnění rovnou nabídneme rozeslání — je to last-minute, každá minuta hraje.
    if (accept) setCreatedSlot({ id, label })
  }

  const remove = async (id: string) => {
    if (!confirm('Smazat toto volné okno?')) return
    setDelId(id)
    const res = await deleteSlot(id)
    if (!res.success) alert(res.error)
    if (createdSlot?.id === id) setCreatedSlot(null)
    router.refresh()
    setDelId(null)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Moje termíny</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Vypadl vám klient? Přidejte volné okno a dejte o něm vědět — zákazníci si ho rovnou rezervují.
        </p>
      </div>

      {preselectedName && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Přidáváte termín pro <strong>„{preselectedName}"</strong> — je už zaškrtnutá níže.
        </div>
      )}

      {/* ── Zbytky po rezervaci: vleze se ještě někdo? ── */}
      {pendingSlots.length > 0 && (
        <div className="space-y-2">
          {pendingSlots.map((slot) => {
            const mins = Math.round(
              (new Date(slot.ends_at).getTime() - new Date(slot.starts_at).getTime()) / 60000
            )
            const label = `${fmtDay(slot.starts_at)} ${fmtTime(slot.starts_at)}–${fmtTime(slot.ends_at)}`
            const busy = remBusy === slot.id
            return (
              <div key={slot.id} className="rounded-2xl border-2 border-amber-300 bg-amber-50/70 p-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100">
                    <UserPlus className="h-5 w-5 text-amber-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-black text-slate-900">Vleze se k vám ještě někdo?</p>
                    <p className="mt-0.5 text-sm leading-relaxed text-slate-600">
                      Po rezervaci vám zbývá <strong>{mins} minut</strong> — {label}.
                      Dokud nerozhodnete, tento čas nikdo nevidí.
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => decideRemainder(slot.id, true, label)}
                    disabled={busy}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 font-bold text-white transition hover:bg-emerald-600 disabled:opacity-60"
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Ano, nabídnout dál
                  </button>
                  <button
                    type="button"
                    onClick={() => decideRemainder(slot.id, false, label)}
                    disabled={busy}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 font-bold text-slate-600 transition hover:border-red-300 hover:text-red-600 disabled:opacity-60"
                  >
                    <XCircle className="h-4 w-4" /> Ne, mám dost
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Právě vytvořené okno: komu dát vědět ── */}
      {createdSlot && (
        <SlotNotifyPanel
          slotId={createdSlot.id}
          label={createdSlot.label}
          onClose={() => setCreatedSlot(null)}
        />
      )}

      {/* ── Přidat okno ── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 flex items-center gap-2 font-black text-slate-900">
          <Plus className="h-5 w-5 text-emerald-600" /> Přidat volné okno
        </h2>

        {services.length === 0 ? (
          <div className="flex items-start gap-2 rounded-xl bg-blue-50 px-4 py-3 text-sm text-slate-600">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
            <span>
              Termíny fungují u úkonů s pevnou cenou a zálohou. Zatím žádný takový v ceníku nemáte —
              přidejte úkon do ceníku některé karty a vraťte se sem.
            </span>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                  <CalendarDays className="h-3.5 w-3.5 text-slate-400" /> Den
                </label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                  min={new Date().toISOString().slice(0, 10)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
              </div>
              <div>
                <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                  <Clock className="h-3.5 w-3.5 text-slate-400" /> Od
                </label>
                <input type="time" value={from} onChange={(e) => setFrom(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
              </div>
              <div>
                <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                  <Clock className="h-3.5 w-3.5 text-slate-400" /> Do
                </label>
                <input type="time" value={to} onChange={(e) => setTo(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
              </div>
            </div>

            <div>
              <p className="mb-1 text-xs font-semibold text-slate-600">
                Kterou kartu do okna nabídnout? <span className="font-normal text-slate-400">(i více)</span>
              </p>
              <p className="mb-2 text-xs text-slate-400">
                Zákazník si pak v ceníku vybere konkrétní úkon — nabídnou se mu jen ty, které se do okna délkou vejdou.
              </p>
              <div className="flex flex-wrap gap-2">
                {services.map((s) => {
                  const isOn = checked.includes(s.id)
                  return (
                    <button key={s.id} type="button" onClick={() => toggle(s.id)}
                      className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm transition-all ${
                        isOn
                          ? 'border-emerald-500 bg-emerald-50 font-semibold text-emerald-700'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                      }`}>
                      <span className={`flex h-3.5 w-3.5 items-center justify-center rounded border ${isOn ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300'}`}>
                        {isOn && <span className="text-[9px] leading-none">✓</span>}
                      </span>
                      {s.title}
                      <span className="inline-flex items-center gap-0.5 text-xs text-slate-400">
                        <ListChecks className="h-3 w-3" />
                        {s.itemCount}
                        {s.shortestMinutes ? ` · od ${s.shortestMinutes} min` : ''}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {err && <p className="text-sm text-red-600">{err}</p>}

            <button onClick={submit} disabled={busy} className="btn-primary w-full justify-center disabled:opacity-60">
              {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Ukládám…</> : <><Plus className="h-4 w-4" /> Přidat okno</>}
            </button>
          </div>
        )}
      </div>

      {/* ── Seznam oken ── */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="font-black text-slate-900">Nadcházející okna</h2>
        </div>
        {normalSlots.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-slate-400">
            Zatím žádná okna. Přidejte první nahoře.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {normalSlots.map((slot) => {
              const names = (slot.slot_services ?? [])
                .map((l) => l.services?.title)
                .filter(Boolean) as string[]
              const taken = slot.status === 'zabrano'
              const label = `${fmtDay(slot.starts_at)} ${fmtTime(slot.starts_at)}–${fmtTime(slot.ends_at)}`

              // Zabrané okno = klikací řádek na detail objednávky.
              const info = (
                <>
                  <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-slate-100 text-xs font-bold text-slate-700">
                    <span>{fmtDay(slot.starts_at)}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-900">
                      {fmtTime(slot.starts_at)}–{fmtTime(slot.ends_at)}
                      <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${taken ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        {taken ? 'Rezervováno' : 'Volno'}
                      </span>
                    </p>
                    <p className="truncate text-sm text-slate-500">{names.join(' · ') || '—'}</p>
                  </div>
                </>
              )

              if (taken && slot.order_id) {
                return (
                  <li key={slot.id}>
                    <Link
                      href={`/dashboard/objednavky/${slot.order_id}`}
                      className="flex items-center gap-3 px-6 py-4 transition-colors hover:bg-slate-50 sm:gap-4"
                    >
                      {info}
                      <span className="hidden shrink-0 text-xs font-semibold text-emerald-600 sm:inline">
                        Detail objednávky
                      </span>
                      <ChevronRight className="h-5 w-5 shrink-0 text-slate-300" />
                    </Link>
                  </li>
                )
              }

              return (
                <li key={slot.id} className="flex flex-wrap items-center gap-3 px-6 py-4 sm:flex-nowrap sm:gap-4">
                  {info}

                  {!taken && (
                    <div className="flex shrink-0 items-center gap-2">
                      <ShareSlotButton slotId={slot.id} label={label} variant="compact" />
                      <button
                        type="button"
                        onClick={() => setCreatedSlot({ id: slot.id, label })}
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-emerald-300 hover:text-emerald-700"
                      >
                        Nabídnout zákazníkům
                      </button>
                      <button onClick={() => remove(slot.id)} disabled={delId === slot.id}
                        className="rounded-lg border border-slate-200 p-2 text-slate-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                        title="Smazat okno">
                        {delId === slot.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}