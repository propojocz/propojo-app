'use client'
import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react'
import { login } from '@/lib/actions/auth'

const schema = z.object({
  email: z.string().email('Neplatný email'),
  password: z.string().min(6, 'Heslo musí mít alespoň 6 znaků'),
})
type LoginValues = z.infer<typeof schema>

export default function PrihlasitPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get('next') ?? '/'
  const [showPassword, setShowPassword] = useState(false)
  const [serverError, setServerError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [stats, setStats] = useState<{ services: number; providers: number } | null>(null)

  useEffect(() => {
    fetch('/api/stats').then(r => r.json()).then(setStats).catch(() => {})
  }, [])

  const { register: f, handleSubmit, formState: { errors } } = useForm<LoginValues>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: LoginValues) => {
    setIsLoading(true); setServerError('')
    const result = await login(data)
    if (result.success) { router.push(next); router.refresh() }
    else { setServerError(result.error); setIsLoading(false) }
  }

  return (
    <div className="flex min-h-screen">
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-indigo-950 via-indigo-900 to-slate-900">
        <div className="absolute inset-0">
          <div className="absolute top-20 left-20 h-64 w-64 rounded-full bg-indigo-500/20 blur-3xl" />
          <div className="absolute bottom-20 right-20 h-80 w-80 rounded-full bg-violet-500/20 blur-3xl" />
        </div>
        <div className="relative z-10 flex flex-col justify-between p-12 text-white">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-indigo-700 font-black text-lg">P</div>
            <span className="text-xl font-black tracking-tight">Propojo</span>
          </Link>
          <div>
            <h2 className="mb-4 text-4xl font-black leading-tight">Vítejte zpět<br /><span className="text-indigo-300">na Propojo</span></h2>
            <p className="text-indigo-200 leading-relaxed">Tisíce zákazníků hledá právě teď kvalitní živnostníky.</p>
            <div className="mt-8 grid grid-cols-2 gap-4">
              {stats ? (
                <>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <div className="text-2xl font-black text-indigo-300">{stats.providers}</div>
                    <div className="text-xs text-indigo-200">Živnostníků</div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <div className="text-2xl font-black text-indigo-300">{stats.services}</div>
                    <div className="text-xs text-indigo-200">Aktivních nabídek</div>
                  </div>
                </>
              ) : (
                [0,1].map(i => (
                  <div key={i} className="rounded-xl border border-white/10 bg-white/5 p-4 animate-pulse">
                    <div className="h-7 w-12 bg-white/10 rounded mb-1" />
                    <div className="h-3 w-20 bg-white/10 rounded" />
                  </div>
                ))
              )}
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 col-span-2">
                <div className="text-2xl font-black text-indigo-300">100%</div>
                <div className="text-xs text-indigo-200">Bez skrytých poplatků</div>
              </div>
            </div>
          </div>
          <p className="text-xs text-indigo-300">© {new Date().getFullYear()} Propojo</p>
        </div>
      </div>

      <div className="flex flex-1 flex-col justify-center px-6 py-12 lg:px-16">
        <div className="mx-auto w-full max-w-md">
          <Link href="/" className="mb-8 flex items-center gap-2 lg:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-600 text-white font-black text-sm">P</div>
            <span className="text-lg font-black text-slate-900">Propojo</span>
          </Link>
          <div className="mb-8">
            <h1 className="text-3xl font-black text-slate-900">Přihlásit se</h1>
            <p className="mt-1.5 text-slate-500">Nemáte účet?{' '}
              <Link href="/registrace" className="font-semibold text-indigo-600 hover:underline">Zaregistrujte se</Link>
            </p>
          </div>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div className="space-y-1.5">
              <label className="form-label">Email</label>
              <input {...f('email')} type="email" placeholder="vas@email.cz" autoComplete="email" className={`form-input ${errors.email ? 'form-input-error' : ''}`} />
              {errors.email && <p className="form-error">{errors.email.message}</p>}
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="form-label">Heslo</label>
                <Link href="/zapomenute-heslo" className="text-xs text-indigo-600 hover:underline">Zapomenuté heslo?</Link>
              </div>
              <div className="relative">
                <input {...f('password')} type={showPassword ? 'text' : 'password'} placeholder="••••••••" autoComplete="current-password" className={`form-input pr-10 ${errors.password ? 'form-input-error' : ''}`} />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && <p className="form-error">{errors.password.message}</p>}
            </div>
            <AnimatePresence>
              {serverError && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  <AlertCircle className="h-4 w-4 shrink-0" />{serverError}
                </motion.div>
              )}
            </AnimatePresence>
            <button type="submit" disabled={isLoading} className="btn-primary w-full">
              {isLoading ? <><Loader2 className="h-4 w-4 animate-spin" /> Přihlašuji…</> : 'Přihlásit se'}
            </button>
          </form>
          <div className="mt-8 text-center">
            <p className="text-sm text-slate-500">Jste živnostník?{' '}
              <Link href="/registrace/zivnostnik" className="font-semibold text-indigo-600 hover:underline">Registrace pro živnostníky →</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
