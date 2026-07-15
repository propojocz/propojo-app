'use client'
// app/zapomenute-heslo/page.tsx
import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Loader2, CheckCircle2, Mail } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function ZapomenuteHesloPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) { setError('Zadejte email.'); return }
    setLoading(true); setError('')

    const supabase = createClient()
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-hesla`,
    })

    if (err) { setError('Nepodařilo se odeslat email. Zkontrolujte adresu.') }
    else { setSent(true) }
    setLoading(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md">
        <Link href="/prihlasit" className="mb-6 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" /> Zpět na přihlášení
        </Link>

        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          {sent ? (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
                <CheckCircle2 className="h-8 w-8 text-emerald-600" />
              </div>
              <h2 className="mb-2 text-xl font-black text-slate-900">Email odeslán!</h2>
              <p className="text-sm text-slate-500 mb-2">
                Zkontrolujte schránku <strong>{email}</strong> a klikněte na odkaz pro reset hesla.
              </p>
              <p className="text-xs text-slate-400">Odkaz je platný 60 minut. Zkontrolujte i složku Spam.</p>
              <Link href="/prihlasit" className="btn-secondary mt-6 inline-flex">
                Zpět na přihlášení
              </Link>
            </div>
          ) : (
            <>
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100">
                  <Mail className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <h1 className="text-xl font-black text-slate-900">Zapomenuté heslo</h1>
                  <p className="text-sm text-slate-500">Pošleme vám odkaz pro reset</p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="form-label">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => { setEmail(e.target.value); setError('') }}
                    placeholder="vas@email.cz"
                    autoComplete="email"
                    required
                    className={`form-input ${error ? 'form-input-error' : ''}`}
                  />
                  {error && <p className="form-error">{error}</p>}
                </div>

                <button type="submit" disabled={loading} className="btn-primary w-full">
                  {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Odesílám…</> : 'Odeslat odkaz pro reset'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}