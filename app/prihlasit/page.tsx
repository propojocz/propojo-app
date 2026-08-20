'use client'
// app/prihlasit/page.tsx
//
// Levý panel neprodává obecné výhody, ale ukazuje, o čem Propojo je: konkrétní
// volné termíny. Kdo se přihlašuje, panel nečte; kdo přišel z odkazu ve story
// nebo z QR kódu, se podle něj rozhoduje, jestli si účet založí.
//
// Přihlášení přes Google vyžaduje zapnutého poskytovatele v Supabase
// (Authentication → Providers → Google) a route app/auth/callback.

import { Suspense, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Eye, EyeOff, Loader2, AlertCircle, Check, CheckCircle2, Lock } from 'lucide-react'
import { login } from '@/lib/actions/auth'
import { createClient } from '@/lib/supabase/client'

const schema = z.object({
  email: z.string().email('Neplatný email'),
  password: z.string().min(6, 'Heslo musí mít alespoň 6 znaků'),
})
type LoginValues = z.infer<typeof schema>

// Ukázka toho, co se na Propoju děje. Statická — živé termíny by na přihlašovací
// stránce znamenaly dotaz do databáze u každého načtení a v prázdných chvílích
// prázdný panel.
const UKAZKA = [
  { cas: '14:00', co: 'Pánský střih', kdo: 'barber Luky · Vsetín' },
  { cas: '15:30', co: 'Výměna zámkové vložky', kdo: 'elektrikář Majty · Rožnov' },
  { cas: '17:00', co: 'Venčení psa', kdo: 'Dog walker · Valašské Meziříčí' },
]

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get('next') ?? '/'
  const potvrzeno = searchParams.get('potvrzeno') === '1'
  const oauthChyba = searchParams.get('chyba') === 'oauth'
  const [showPassword, setShowPassword] = useState(false)
  const [serverError, setServerError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  const {
    register: f,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({ resolver: zodResolver(schema) })

  const onSubmit = async (data: LoginValues) => {
    setIsLoading(true)
    setServerError('')
    const result = await login(data)
    if (result.success) {
      router.push(next)
      router.refresh()
    } else {
      setServerError(result.error)
      setIsLoading(false)
    }
  }

  const prihlasGooglem = async () => {
    setGoogleLoading(true)
    setServerError('')
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          // zdroj=google říká callbacku, že nejde o potvrzení e-mailu
          redirectTo: `${window.location.origin}/auth/callback?zdroj=google&next=${encodeURIComponent(next)}`,
        },
      })
      if (error) {
        setServerError('Přihlášení přes Google se nepodařilo. Zkuste to prosím znovu.')
        setGoogleLoading(false)
      }
      // Při úspěchu nás prohlížeč přesměruje ke Googlu — nic dalšího neděláme.
    } catch {
      setServerError('Přihlášení přes Google se nepodařilo. Zkuste to prosím znovu.')
      setGoogleLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* ── LEVÁ STRANA ── */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-[#0B231D] p-12 text-white lg:flex">
        {/* Pomalu plynoucí světlo na pozadí. Čistě CSS — žádná knihovna, žádné
            překreslování, na slabším telefonu to nic nestojí. Kdo má v systému
            zapnuté omezení animací, uvidí statickou verzi. */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <span className="propojo-svetlo propojo-svetlo-1" />
          <span className="propojo-svetlo propojo-svetlo-2" />
          <span className="propojo-svetlo propojo-svetlo-3" />
        </div>
        <style jsx>{`
          .propojo-svetlo {
            position: absolute;
            display: block;
            border-radius: 9999px;
            filter: blur(80px);
            will-change: transform;
          }
          .propojo-svetlo-1 {
            top: -18%; right: -12%;
            width: 30rem; height: 30rem;
            background: rgba(16, 185, 129, 0.28);
            animation: plyn1 26s ease-in-out infinite;
          }
          .propojo-svetlo-2 {
            bottom: -20%; left: -14%;
            width: 26rem; height: 26rem;
            background: rgba(56, 189, 248, 0.16);
            animation: plyn2 32s ease-in-out infinite;
          }
          .propojo-svetlo-3 {
            top: 38%; left: 30%;
            width: 20rem; height: 20rem;
            background: rgba(52, 211, 153, 0.12);
            animation: plyn3 38s ease-in-out infinite;
          }
          @keyframes plyn1 {
            0%, 100% { transform: translate(0, 0) scale(1); }
            50%      { transform: translate(-3rem, 3rem) scale(1.12); }
          }
          @keyframes plyn2 {
            0%, 100% { transform: translate(0, 0) scale(1); }
            50%      { transform: translate(3.5rem, -2.5rem) scale(1.08); }
          }
          @keyframes plyn3 {
            0%, 100% { transform: translate(0, 0) scale(1); opacity: .7; }
            50%      { transform: translate(-2rem, -3rem) scale(1.2); opacity: 1; }
          }
          @media (prefers-reduced-motion: reduce) {
            .propojo-svetlo { animation: none; }
          }
        `}</style>

        <Link href="/" className="relative z-10 flex items-center gap-2.5">
          <img src="/propojo-logo-full.png" alt="Propojo" className="h-9 w-auto object-contain brightness-0 invert" />
        </Link>

        <div className="relative z-10">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-300">
            Vsetínsko · Zlínsko · Rožnovsko
          </p>
          <h2 className="mt-3.5 max-w-[15ch] text-4xl font-extrabold leading-[1.05] tracking-tight">
            Řemeslník, který má volno <span className="text-emerald-400">dneska</span>.
          </h2>
          <p className="mt-4 max-w-sm leading-relaxed text-white/70">
            Živnostníkům vypadávají klienti, vám hoří kohoutek. Propojo tyhle dvě věci spojí —
            uvidíte konkrétní volné časy a zamluvíte si je zálohou.
          </p>

          {/* Ukázka volných termínů */}
          <div className="mt-8">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-white/50">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
              </span>
              Například dnes odpoledne
            </p>
            <ul className="mt-3 border-t border-white/10">
              {UKAZKA.map((t) => (
                <li key={t.cas} className="flex items-center gap-4 border-b border-white/10 py-3">
                  <span className="w-14 shrink-0 font-mono text-[15px] font-semibold tabular-nums">{t.cas}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-white/90">{t.co}</span>
                    <span className="block truncate text-xs text-white/45">{t.kdo}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <ul className="relative z-10 space-y-3">
          {[
            'Ověření poskytovatelé přes ARES',
            'Záloha zpět, když řemeslník nedorazí',
            'Žádné provize ze zakázek',
          ].map((t) => (
            <li key={t} className="flex items-center gap-3 text-sm text-white/75">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20">
                <Check className="h-3 w-3 text-emerald-400" strokeWidth={3} />
              </span>
              {t}
            </li>
          ))}
        </ul>
      </div>

      {/* ── PRAVÁ STRANA – formulář ── */}
      <div className="relative flex flex-1 items-center justify-center px-6 py-12 lg:px-12">
        <div className="w-full max-w-sm">
          {/* Levý panel s logem se na mobilu neukazuje, tak ho dáme sem. */}
          <Link href="/" className="mb-7 block lg:hidden">
            <img src="/propojo-logo-full.png" alt="Propojo" className="h-8 w-auto object-contain" />
          </Link>

          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Přihlášení</h1>
          <p className="mb-6 mt-1.5 text-slate-500">Rezervace i zakázky najdete hned po přihlášení.</p>

          {potvrzeno && (
            <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <span><strong>E-mail potvrzen.</strong> Teď se můžete přihlásit.</span>
            </div>
          )}

          {oauthChyba && (
            <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <span>Přihlášení přes Google se nedokončilo. Zkuste to znovu, nebo použijte e-mail a heslo.</span>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-bold text-slate-800">E-mail</label>
              <input
                {...f('email')}
                type="email"
                placeholder="vas@email.cz"
                autoComplete="email"
                className={`w-full rounded-xl border-[1.5px] px-4 py-3 text-[15px] outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 ${
                  errors.email ? 'border-red-400' : 'border-slate-200'
                }`}
              />
              {errors.email && <p className="mt-1.5 text-sm text-red-600">{errors.email.message}</p>}
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-sm font-bold text-slate-800">Heslo</label>
                <Link href="/zapomenute-heslo" className="text-sm font-bold text-emerald-600 hover:underline">
                  Zapomněli jste heslo?
                </Link>
              </div>
              <div className="relative">
                <input
                  {...f('password')}
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className={`w-full rounded-xl border-[1.5px] px-4 py-3 pr-10 text-[15px] outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 ${
                    errors.password ? 'border-red-400' : 'border-slate-200'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Skrýt heslo' : 'Zobrazit heslo'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && <p className="mt-1.5 text-sm text-red-600">{errors.password.message}</p>}
            </div>

            <AnimatePresence>
              {serverError && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                >
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {serverError}
                </motion.div>
              )}
            </AnimatePresence>

            <button
              type="submit"
              disabled={isLoading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3.5 font-extrabold text-white transition hover:bg-emerald-600 disabled:opacity-70"
            >
              {isLoading ? (<><Loader2 className="h-4 w-4 animate-spin" /> Přihlašuji…</>) : 'Přihlásit se'}
            </button>
          </form>

          {/* ── Google ── */}
          <div className="my-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-slate-200" />
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">nebo</span>
            <span className="h-px flex-1 bg-slate-200" />
          </div>

          <button
            type="button"
            onClick={prihlasGooglem}
            disabled={googleLoading}
            className="flex w-full items-center justify-center gap-2.5 rounded-xl border-[1.5px] border-slate-200 bg-white py-3 font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-70"
          >
            {googleLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.57c2.08-1.92 3.27-4.74 3.27-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.76c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/>
              </svg>
            )}
            Pokračovat přes Google
          </button>

          <p className="mt-6 text-center text-sm text-slate-600">
            Nemáte účet?{' '}
            <Link href="/registrace" className="font-bold text-emerald-600 hover:underline">Zaregistrujte se</Link>
          </p>
          <p className="mt-2 text-center text-sm text-slate-500">
            Jste živnostník?{' '}
            <Link href="/registrace/zivnostnik" className="font-bold text-emerald-600 hover:underline">
              Registrace pro živnostníky →
            </Link>
          </p>

          <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-slate-400">
            <Lock className="h-3 w-3" /> Vaše data jsou u nás v bezpečí
          </p>
        </div>
      </div>
    </div>
  )
}

export default function PrihlasitPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}