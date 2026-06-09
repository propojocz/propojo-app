'use client'
// app/reset-hesla/page.tsx
// Stránka kam Supabase přesměruje po kliknutí na link v emailu

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { Eye, EyeOff, Loader2, CheckCircle2, AlertCircle, KeyRound } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function ResetHeslaPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const [sessionReady, setSessionReady] = useState(false)

  useEffect(() => {
    // Supabase automaticky zpracuje token z URL hash (#access_token=...)
    const supabase = createClient()
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setSessionReady(true)
      }
    })
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('Heslo musí mít alespoň 8 znaků.')
      return
    }
    if (password !== confirm) {
      setError('Hesla se neshodují.')
      return
    }

    setLoading(true)
    const supabase = createClient()
    const { error: updateError } = await supabase.auth.updateUser({ password })

    if (updateError) {
      setError('Nepodařilo se změnit heslo. Zkuste znovu požádat o reset.')
      setLoading(false)
      return
    }

    setSuccess(true)
    setTimeout(() => router.push('/dashboard'), 2500)
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm"
        >
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
          </div>
          <h2 className="mb-2 text-2xl font-black text-slate-900">Heslo změněno!</h2>
          <p className="text-slate-500">Přesměrováváme vás na dashboard…</p>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="mb-8 text-center">
          <Link href="/" className="inline-flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white font-black text-lg">P</div>
            <span className="text-xl font-black text-slate-900">Propojo</span>
          </Link>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100">
              <KeyRound className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900">Nové heslo</h1>
              <p className="text-sm text-slate-500">Zadejte nové heslo pro váš účet</p>
            </div>
          </div>

          {!sessionReady && (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              Ověřuji odkaz z emailu…
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="form-label">Nové heslo</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Alespoň 8 znaků"
                  autoComplete="new-password"
                  className="form-input pr-10"
                  disabled={!sessionReady}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {/* Síla hesla */}
              {password.length > 0 && (
                <div className="flex gap-1 mt-1.5">
                  {[1,2,3,4].map(i => (
                    <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${
                      password.length >= i * 3
                        ? i <= 1 ? 'bg-red-400' : i <= 2 ? 'bg-amber-400' : i <= 3 ? 'bg-indigo-400' : 'bg-emerald-400'
                        : 'bg-slate-200'
                    }`} />
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="form-label">Potvrdit heslo</label>
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="Zopakujte heslo"
                autoComplete="new-password"
                className={`form-input ${confirm && confirm !== password ? 'form-input-error' : ''}`}
                disabled={!sessionReady}
              />
              {confirm && confirm !== password && (
                <p className="form-error">Hesla se neshodují</p>
              )}
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" />{error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !sessionReady || !password || password !== confirm}
              className="btn-primary w-full"
            >
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Ukládám…</> : 'Nastavit nové heslo'}
            </button>
          </form>

          <p className="mt-4 text-center text-sm text-slate-500">
            Vzpomněli jste si?{' '}
            <Link href="/prihlasit" className="font-semibold text-indigo-600 hover:underline">Přihlásit se</Link>
          </p>
        </div>
      </motion.div>
    </div>
  )
}
