'use client'
// components/ui/ChangePasswordSection.tsx
// Změna hesla pro přihlášeného uživatele.
//
// BEZPEČNOST: Supabase u přihlášeného ke změně hesla staré heslo NEvyžaduje
// (stačí platná session). To je slabé — kdo sedne k odemčenému počítači, změní
// heslo bez znalosti starého. Proto staré heslo ověřujeme sami: zkusíme se s ním
// znovu přihlásit (signInWithPassword). Teprve když projde, heslo změníme.

import { useState } from 'react'
import { Loader2, CheckCircle2, AlertCircle, KeyRound, Eye, EyeOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function ChangePasswordSection({ userEmail }: { userEmail: string }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleSubmit = async () => {
    setError(''); setSuccess(false)

    // Validace na klientu
    if (!current) { setError('Zadejte své současné heslo.'); return }
    if (next.length < 8) { setError('Nové heslo musí mít alespoň 8 znaků.'); return }
    if (next !== confirm) { setError('Nová hesla se neshodují.'); return }
    if (next === current) { setError('Nové heslo se musí lišit od současného.'); return }

    setSaving(true)
    const supabase = createClient()

    // 1) Ověření SOUČASNÉHO hesla — zkusíme se s ním znovu přihlásit.
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: userEmail,
      password: current,
    })
    if (signInErr) {
      setError('Současné heslo není správné.')
      setSaving(false)
      return
    }

    // 2) Teprve teď nastavíme nové heslo.
    const { error: updateErr } = await supabase.auth.updateUser({ password: next })
    if (updateErr) {
      setError('Heslo se nepodařilo změnit. Zkuste to prosím znovu.')
      setSaving(false)
      return
    }

    setSuccess(true)
    setCurrent(''); setNext(''); setConfirm('')
    setSaving(false)
    setTimeout(() => setSuccess(false), 4000)
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100">
          <KeyRound className="h-5 w-5 text-slate-600" />
        </div>
        <div>
          <h2 className="text-lg font-black text-slate-900">Změna hesla</h2>
          <p className="text-sm text-slate-500">Pro změnu zadejte své současné heslo</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="form-label">Současné heslo</label>
          <div className="relative">
            <input
              type={show ? 'text' : 'password'}
              value={current}
              onChange={(e) => { setCurrent(e.target.value); setError('') }}
              autoComplete="current-password"
              placeholder="Vaše nynější heslo"
              className="form-input pr-11"
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              tabIndex={-1}
              aria-label={show ? 'Skrýt hesla' : 'Zobrazit hesla'}
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="form-label">Nové heslo</label>
            <input
              type={show ? 'text' : 'password'}
              value={next}
              onChange={(e) => { setNext(e.target.value); setError('') }}
              autoComplete="new-password"
              placeholder="Alespoň 8 znaků"
              className="form-input"
            />
          </div>
          <div className="space-y-1.5">
            <label className="form-label">Nové heslo znovu</label>
            <input
              type={show ? 'text' : 'password'}
              value={confirm}
              onChange={(e) => { setConfirm(e.target.value); setError('') }}
              autoComplete="new-password"
              placeholder="Zopakujte nové heslo"
              className="form-input"
            />
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />{error}
          </div>
        )}
        {success && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            <CheckCircle2 className="h-4 w-4 shrink-0" />Heslo bylo změněno.
          </div>
        )}

        <button onClick={handleSubmit} disabled={saving} className="btn-primary">
          {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Měním…</> : 'Změnit heslo'}
        </button>
      </div>
    </div>
  )
}