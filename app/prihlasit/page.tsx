'use client'
import { Suspense, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Eye, EyeOff, Loader2, AlertCircle, Check, CheckCircle2 } from 'lucide-react'
import { login } from '@/lib/actions/auth'

const schema = z.object({
  email: z.string().email('Neplatný email'),
  password: z.string().min(6, 'Heslo musí mít alespoň 6 znaků'),
})
type LoginValues = z.infer<typeof schema>

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get('next') ?? '/'
  const potvrzeno = searchParams.get('potvrzeno') === '1'
  const [showPassword, setShowPassword] = useState(false)
  const [serverError, setServerError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

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

  return (
    <div className="flex min-h-screen">
      {/* LEVÁ STRANA – branding */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-gradient-to-br from-slate-900 to-[#243044] p-12 text-white lg:flex">
        <div className="pointer-events-none absolute -right-[15%] -top-[20%] h-96 w-96 rounded-full bg-emerald-500/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-[10%] -left-[10%] h-80 w-80 rounded-full bg-blue-500/20 blur-3xl" />

        <div className="relative z-10">
          <h2 className="mb-4 text-4xl font-extrabold leading-tight tracking-tight">
            Vítá Vás Propojo.cz.
          </h2>
          <p className="max-w-sm leading-relaxed text-white/80">
            Přihlaste se a pokračujte ve správě svých rezervací nebo služeb.
          </p>
        </div>

        <ul className="relative z-10 space-y-4">
          {[
            'Ověření poskytovatelé přes ARES',
            'Záloha zpět, když řemeslník nedorazí',
            'Žádné provize ze zakázek',
          ].map((t) => (
            <li key={t} className="flex items-center gap-3 text-[15px]">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/20">
                <Check className="h-3.5 w-3.5 text-emerald-400" strokeWidth={3} />
              </span>
              {t}
            </li>
          ))}
        </ul>
      </div>

      {/* PRAVÁ STRANA – formulář */}
      <div className="relative flex flex-1 items-center justify-center px-6 py-12 lg:px-12">
        <Link href="/" className="absolute right-6 top-6 flex items-center gap-2.5 lg:right-12">
          <img src="/propojo-logo.png" alt="Propojo" className="h-9 w-auto object-contain" />
        </Link>
        <div className="w-full max-w-sm">
          

          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Přihlášení</h1>
          <p className="mb-6 mt-1.5 text-slate-500">Zadejte své údaje pro vstup do účtu.</p>

          {potvrzeno && (
            <div className="mb-6 flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <span><strong>E-mail potvrzen.</strong> Teď se můžete přihlásit.</span>
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
                className={`w-full rounded-xl border-[1.5px] px-4 py-3 text-[15px] outline-none transition focus:border-emerald-500 ${
                  errors.email ? 'border-red-400' : 'border-slate-200'
                }`}
              />
              {errors.email && <p className="mt-1.5 text-sm text-red-600">{errors.email.message}</p>}
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-sm font-bold text-slate-800">Heslo</label>
                <Link
                  href="/zapomenute-heslo"
                  className="text-sm font-bold text-emerald-600 hover:underline"
                >
                  Zapomněli jste heslo?
                </Link>
              </div>
              <div className="relative">
                <input
                  {...f('password')}
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className={`w-full rounded-xl border-[1.5px] px-4 py-3 pr-10 text-[15px] outline-none transition focus:border-emerald-500 ${
                    errors.password ? 'border-red-400' : 'border-slate-200'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1.5 text-sm text-red-600">{errors.password.message}</p>
              )}
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
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Přihlašuji…
                </>
              ) : (
                'Přihlásit se'
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-600">
            Nemáte účet?{' '}
            <Link href="/registrace" className="font-bold text-emerald-600 hover:underline">
              Zaregistrujte se
            </Link>
          </p>
          <p className="mt-2 text-center text-sm text-slate-500">
            Jste živnostník?{' '}
            <Link
              href="/registrace/zivnostnik"
              className="font-bold text-emerald-600 hover:underline"
            >
              Registrace pro živnostníky →
            </Link>
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