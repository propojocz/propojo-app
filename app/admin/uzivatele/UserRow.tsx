'use client'
// app/admin/uzivatele/UserRow.tsx
import { useState } from 'react'
import Link from 'next/link'
import { Ban, RotateCcw, Loader2, ExternalLink, BadgeCheck, X } from 'lucide-react'
import Avatar from '@/components/ui/Avatar'
import { setUserSuspended, type AdminUserRow } from '@/lib/actions/admin'

export default function UserRow({ user }: { user: AdminUserRow }) {
  const [suspended, setSuspended] = useState(user.is_suspended === true)
  const [busy, setBusy] = useState(false)
  const [asking, setAsking] = useState(false)   // zobrazené pole na důvod
  const [reason, setReason] = useState('')

  const name = user.company_name || user.full_name || 'Bez jména'
  const datum = new Intl.DateTimeFormat('cs-CZ', { month: 'long', year: 'numeric' }).format(new Date(user.created_at))

  // Obnovení – rovnou, bez ptaní
  const restore = async () => {
    setBusy(true)
    const res = await setUserSuspended(user.id, false)
    if (res.success) setSuspended(false)
    setBusy(false)
  }

  // Pozastavení – potvrzení s důvodem
  const confirmSuspend = async () => {
    setBusy(true)
    const res = await setUserSuspended(user.id, true, reason)
    if (res.success) { setSuspended(true); setAsking(false); setReason('') }
    setBusy(false)
  }

  return (
    <div className="border-b border-slate-100 px-4 py-3 last:border-0">
      <div className="flex items-center gap-3">
        <Avatar name={name} url={null} size={40} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-semibold text-slate-900">{name}</p>
            {user.is_provider && (
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">živnostník</span>
            )}
            {user.is_admin && (
              <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-bold text-white">admin</span>
            )}
            {user.ico && (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-600"><BadgeCheck className="h-3 w-3" /> {user.ico}</span>
            )}
            {suspended && (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">pozastaven</span>
            )}
          </div>
          <p className="text-xs text-slate-500">
            {user.city ? `${user.city} · ` : ''}na Propojo od {datum}
          </p>
        </div>

        {user.is_provider && (
          <Link href={`/profil/${user.id}`} target="_blank" className="shrink-0 text-slate-300 hover:text-slate-500" title="Veřejný profil">
            <ExternalLink className="h-4 w-4" />
          </Link>
        )}

        {!user.is_admin && (
          suspended ? (
            <button
              onClick={restore}
              disabled={busy}
              className="flex shrink-0 items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-200 disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
              Obnovit
            </button>
          ) : (
            <button
              onClick={() => setAsking(true)}
              disabled={busy || asking}
              className="flex shrink-0 items-center gap-1.5 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-bold text-red-600 transition hover:bg-red-100 disabled:opacity-60"
            >
              <Ban className="h-3.5 w-3.5" /> Pozastavit
            </button>
          )
        )}
      </div>

      {/* Pole na důvod pozastavení */}
      {asking && (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-bold text-red-700">Důvod pozastavení (uvidí ho uživatel)</p>
            <button onClick={() => { setAsking(false); setReason('') }} className="text-red-400 hover:text-red-600">
              <X className="h-4 w-4" />
            </button>
          </div>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="Např. opakované porušení pravidel, nevhodný obsah profilu…"
            className="w-full resize-none rounded-lg border border-red-200 px-3 py-2 text-sm outline-none focus:border-red-400"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              onClick={() => { setAsking(false); setReason('') }}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-white"
            >
              Zrušit
            </button>
            <button
              onClick={confirmSuspend}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-red-700 disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
              Potvrdit pozastavení
            </button>
          </div>
        </div>
      )}
    </div>
  )
}