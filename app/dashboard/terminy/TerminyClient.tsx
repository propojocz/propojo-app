'use client'
// app/dashboard/terminy/TerminyClient.tsx
// Poskytovatel: přidá volné okno (den, od-do) a zaškrtne služby, které se do něj vejdou.
// Zákazník pak okno uvidí u zaškrtnutých služeb a rezervuje (další část Fáze 1).

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarDays, Clock, Plus, Trash2, Loader2, Info, CheckCircle2 } from 'lucide-react'
import { createSlot, deleteSlot } from '@/lib/actions/slots'

type ServiceLite = { id: string; title: string; duration_minutes: number | null }
type SlotRow = {
  id: string
  starts_at: string
  ends_at: string
  status: string
  slot_services: { service_id: string; services: { title: string } | null }[]
}

export default function TerminyClient({ services, slots, preselectedServiceId }: { services: ServiceLite[]; slots: SlotRow[]; preselectedServiceId?: string }) {
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
  const [ok, setOk] = useState(false)

  const toggle = (id: string) =>
    setChecked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const submit = async () => {
    setErr('')
    setOk(false)
    if (!date || !from || !to) { setErr('Vyplňte den a čas od–do.'); return }
    if (checked.length === 0) { setErr('Zaškrtněte alespoň jednu službu, která se do okna vejde.'); return }
    setBusy(true)
    const res = await createSlot({
      starts_at: new Date(`${date}T${from}:00`).toISOString(),
      ends_at: new Date(`${date}T${to}:00`).toISOString(),
      service_ids: checked,
    })
    if (res.success) {
      setOk(true)
      setDate(''); setFrom(''); setTo(''); setChecked([])
      router.refresh()
      setTimeout(() => setOk(false), 3000)
    } else {
      setErr(res.error)
    }
    setBusy(false)
  }

  const remove = async (id: string) => {
    if (!confirm('Smazat toto volné okno?')) return
    setDelId(id)
    const res = await deleteSlot(id)
    if (!res.success) alert(res.error)
    router.refresh()
    setDelId(null)
  }

  const fmtDay = (iso: string) =>
    new Intl.DateTimeFormat('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric' }).format(new Date(iso))
  const fmtTime = (iso: string) =>
    new Intl.DateTimeFormat('cs-CZ', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Moje termíny</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Máte volno? Přidejte okno a zákazníci si ho rovnou rezervují.
        </p>
      </div>

      {preselectedName && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Přidáváte termín pro <strong>„{preselectedName}"</strong> — je už zaškrtnutá níže. Klidně přidejte i další příbuznou službu, pokud se vejde do stejného okna.
        </div>
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
              Termíny fungují u služeb s rezervační zálohou. Zatím žádnou aktivní nemáte —
              přidejte službu a vraťte se sem.
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
              <p className="mb-2 text-xs font-semibold text-slate-600">
                Co se do okna vejde? <span className="font-normal text-slate-400">(zaškrtněte jednu i více)</span>
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
                      {s.duration_minutes ? <span className="text-xs text-slate-400">· {s.duration_minutes} min</span> : null}
                    </button>
                  )
                })}
              </div>
            </div>

            {err && <p className="text-sm text-red-600">{err}</p>}
            {ok && (
              <p className="flex items-center gap-1.5 text-sm text-emerald-600">
                <CheckCircle2 className="h-4 w-4" /> Okno přidáno. Zákazníci ho uvidí u vybraných služeb.
              </p>
            )}

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
        {slots.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-slate-400">
            Zatím žádná okna. Přidejte první nahoře.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {slots.map((slot) => {
              const names = (slot.slot_services ?? [])
                .map((l) => l.services?.title)
                .filter(Boolean) as string[]
              const taken = slot.status === 'zabrano'
              return (
                <li key={slot.id} className="flex items-center gap-4 px-6 py-4">
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
                  {!taken && (
                    <button onClick={() => remove(slot.id)} disabled={delId === slot.id}
                      className="rounded-lg border border-slate-200 p-2 text-slate-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                      title="Smazat okno">
                      {delId === slot.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </button>
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