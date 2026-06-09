'use client'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { Eye, EyeOff, Loader2, AlertCircle, CheckCircle2, Check, Info, ArrowRight } from 'lucide-react'
import { register as registerAction } from '@/lib/actions/auth'
 
const schema = z.object({
  email: z.string().email('Neplatný email'),
  password: z.string().min(8, 'Heslo musí mít alespoň 8 znaků'),
  full_name: z.string().min(2, 'Zadejte celé jméno'),
})
type FormValues = z.infer<typeof schema>
 
export default function RegistracePage() {
  const [role, setRole] = useState<'customer' | 'provider'>('customer')
  const [showPassword, setShowPassword] = useState(false)
  const [serverError, setServerError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [success, setSuccess] = useState(false)
 
  const {
    register: f,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })
 
  const onSubmit = async (data: FormValues) => {
    setIsLoading(true)
    setServerError('')
    const result = await registerAction({ ...data, is_provider: false })
    if (result.success) {
      setSuccess(true)
    } else {
      setServerError(result.error)
      setIsLoading(false)
    }
  }
 
  // ── Úspěšná registrace ──
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
          <h2 className="mb-2 text-2xl font-extrabold text-slate-900">Téměř hotovo!</h2>
          <p className="text-slate-500">
            Poslali jsme vám potvrzovací email. Klikněte na odkaz a váš účet bude aktivován.
          </p>
          <Link
            href="/prihlasit"
            className="mt-6 block w-full rounded-xl bg-emerald-500 py-3.5 font-extrabold text-white transition hover:bg-emerald-600"
          >
            Přejít na přihlášení
          </Link>
        </motion.div>
      </div>
    )
  }
 
  return (
    <div className="flex min-h-screen">
      {/* LEVÁ STRANA – branding */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-gradient-to-br from-slate-900 to-[#243044] p-12 text-white lg:flex">
        <div className="pointer-events-none absolute -right-[15%] -top-[20%] h-96 w-96 rounded-full bg-emerald-500/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-[10%] -left-[10%] h-80 w-80 rounded-full bg-blue-500/20 blur-3xl" />
 
        <Link href="/" className="relative z-10 flex items-center gap-2.5">
          <span className="flex gap-1.5">
            <span className="h-3 w-3 rounded-full bg-emerald-500" />
            <span className="h-3 w-3 rounded-full bg-blue-500" />
            <span className="h-3 w-3 rounded-full bg-amber-500" />
          </span>
          <span className="text-xl font-extrabold">propojo.cz</span>
        </Link>
 
        <div className="relative z-10">
          <h2 className="mb-4 text-4xl font-extrabold leading-tight tracking-tight">
            Vítejte v Propojo.
          </h2>
          <p className="max-w-sm leading-relaxed text-white/80">
            Najděte ověřené řemeslníky a salóny, nebo začněte nabízet své služby tisícům
            zákazníků.
          </p>
        </div>
 
        <ul className="relative z-10 space-y-4">
          {[
            'Ověření poskytovatelé přes ARES',
            'Rezervační záloha = jistota',
            'Bez provizí pro poskytovatele',
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
      <div className="flex flex-1 items-center justify-center px-6 py-12 lg:px-12">
        <div className="w-full max-w-sm">
          <Link href="/" className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="flex gap-1.5">
              <span className="h-3 w-3 rounded-full bg-emerald-500" />
              <span className="h-3 w-3 rounded-full bg-blue-500" />
              <span className="h-3 w-3 rounded-full bg-amber-500" />
            </span>
            <span className="text-xl font-extrabold text-slate-900">propojo.cz</span>
          </Link>
 
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Vytvořit účet</h1>
          <p className="mb-6 mt-1.5 text-slate-500">Zaregistrujte se a začněte během minuty.</p>
 
          {/* Přepínač role */}
          <div className="mb-6 flex gap-2 rounded-xl bg-slate-100 p-1.5">
            <button
              type="button"
              onClick={() => setRole('customer')}
              className={`flex-1 rounded-lg py-2.5 text-sm font-bold transition ${
                role === 'customer' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
              }`}
            >
              Jsem zákazník
            </button>
            <button
              type="button"
              onClick={() => setRole('provider')}
              className={`flex-1 rounded-lg py-2.5 text-sm font-bold transition ${
                role === 'provider' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
              }`}
            >
              Jsem poskytovatel
            </button>
          </div>
 
          {role === 'provider' ? (
            // ── Poskytovatel → odkaz na průvodce s IČO ──
            <div>
              <div className="mb-5 flex items-start gap-2.5 rounded-xl bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-800">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <span>
                  Jako poskytovatel budete potřebovat platné IČO – ověříme ho přes ARES.
                  První měsíc máte zdarma.
                </span>
              </div>
              <Link
                href="/registrace/zivnostnik"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3.5 font-extrabold text-white transition hover:bg-emerald-600"
              >
                Pokračovat k registraci <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ) : (
            // ── Zákazník → formulář ──
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-bold text-slate-800">Celé jméno</label>
                <input
                  {...f('full_name')}
                  placeholder="Jan Novák"
                  className={`w-full rounded-xl border-[1.5px] px-4 py-3 text-[15px] outline-none transition focus:border-emerald-500 ${
                    errors.full_name ? 'border-red-400' : 'border-slate-200'
                  }`}
                />
                {errors.full_name && (
                  <p className="mt-1.5 text-sm text-red-600">{errors.full_name.message}</p>
                )}
              </div>
 
              <div>
                <label className="mb-1.5 block text-sm font-bold text-slate-800">E-mail</label>
                <input
                  {...f('email')}
                  type="email"
                  placeholder="vas@email.cz"
                  className={`w-full rounded-xl border-[1.5px] px-4 py-3 text-[15px] outline-none transition focus:border-emerald-500 ${
                    errors.email ? 'border-red-400' : 'border-slate-200'
                  }`}
                />
                {errors.email && <p className="mt-1.5 text-sm text-red-600">{errors.email.message}</p>}
              </div>
 
              <div>
                <label className="mb-1.5 block text-sm font-bold text-slate-800">Heslo</label>
                <div className="relative">
                  <input
                    {...f('password')}
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Alespoň 8 znaků"
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
                    <Loader2 className="h-4 w-4 animate-spin" /> Registruji…
                  </>
                ) : (
                  'Vytvořit účet zdarma'
                )}
              </button>
            </form>
          )}
 
          <p className="mt-6 text-center text-sm text-slate-600">
            Už máte účet?{' '}
            <Link href="/prihlasit" className="font-bold text-emerald-600 hover:underline">
              Přihlásit se
            </Link>
          </p>
          <p className="mt-4 text-center text-xs leading-relaxed text-slate-400">
            Registrací souhlasíte s{' '}
            <Link href="/podminky" className="text-slate-600 underline">
              obchodními podmínkami
            </Link>{' '}
            a{' '}
            <Link href="/soukromi" className="text-slate-600 underline">
              zásadami ochrany osobních údajů
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  )
}