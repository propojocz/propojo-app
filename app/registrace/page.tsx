'use client'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { Eye, EyeOff, Loader2, AlertCircle, CheckCircle2, Wrench, Search } from 'lucide-react'
import { register as registerAction } from '@/lib/actions/auth'

const schema = z.object({
  email: z.string().email('Neplatný email'),
  password: z.string().min(8, 'Heslo musí mít alespoň 8 znaků'),
  full_name: z.string().min(2, 'Zadejte celé jméno'),
})
type FormValues = z.infer<typeof schema>

export default function RegistracePage() {
  const [showPassword, setShowPassword] = useState(false)
  const [serverError, setServerError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const { register: f, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormValues) => {
    setIsLoading(true); setServerError('')
    const result = await registerAction({ ...data, is_provider: false })
    if (result.success) { setSuccess(true) }
    else { setServerError(result.error); setIsLoading(false) }
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
          </div>
          <h2 className="mb-2 text-2xl font-black text-slate-900">Téměř hotovo!</h2>
          <p className="text-slate-500">Poslali jsme vám potvrzovací email. Klikněte na odkaz a váš účet bude aktivován.</p>
          <Link href="/prihlasit" className="btn-primary mt-6 w-full justify-center">Přejít na přihlášení</Link>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto flex w-full max-w-5xl flex-col justify-center px-4 py-12 sm:px-6">
        <div className="mb-8 text-center">
          <Link href="/" className="inline-flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white font-black text-lg">P</div>
            <span className="text-xl font-black text-slate-900">Propojo</span>
          </Link>
        </div>
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-black text-slate-900">Vytvořit účet</h1>
          <p className="mt-2 text-slate-500">Vyberte typ vašeho účtu</p>
        </div>
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 max-w-2xl mx-auto w-full">
          <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-indigo-500 bg-indigo-50 p-6 text-center shadow-md">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-indigo-100"><Search className="h-7 w-7 text-indigo-600" /></div>
            <div><p className="font-bold text-slate-900">Hledám službu</p><p className="text-xs text-slate-500 mt-0.5">Chci objednávat od živnostníků</p></div>
          </div>
          <Link href="/registrace/zivnostnik" className="flex flex-col items-center gap-3 rounded-2xl border-2 border-slate-200 bg-white p-6 text-center transition-all hover:border-indigo-300 hover:shadow-md">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-slate-100"><Wrench className="h-7 w-7 text-slate-600" /></div>
            <div><p className="font-bold text-slate-900">Jsem živnostník</p><p className="text-xs text-slate-500 mt-0.5">Chci nabízet své služby</p></div>
          </Link>
        </div>
        <div className="mx-auto w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h2 className="mb-6 text-xl font-black text-slate-900">Registrace zákazníka</h2>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <label className="form-label">Celé jméno</label>
              <input {...f('full_name')} placeholder="Jan Novák" className={`form-input ${errors.full_name ? 'form-input-error' : ''}`} />
              {errors.full_name && <p className="form-error">{errors.full_name.message}</p>}
            </div>
            <div className="space-y-1.5">
              <label className="form-label">Email</label>
              <input {...f('email')} type="email" placeholder="vas@email.cz" className={`form-input ${errors.email ? 'form-input-error' : ''}`} />
              {errors.email && <p className="form-error">{errors.email.message}</p>}
            </div>
            <div className="space-y-1.5">
              <label className="form-label">Heslo</label>
              <div className="relative">
                <input {...f('password')} type={showPassword ? 'text' : 'password'} placeholder="Alespoň 8 znaků" className={`form-input pr-10 ${errors.password ? 'form-input-error' : ''}`} />
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
              {isLoading ? <><Loader2 className="h-4 w-4 animate-spin" /> Registruji…</> : 'Vytvořit účet zdarma'}
            </button>
          </form>
          <p className="mt-4 text-center text-xs text-slate-400">Již máte účet?{' '}
            <Link href="/prihlasit" className="text-indigo-600 hover:underline font-semibold">Přihlásit se</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
