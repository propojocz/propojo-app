'use client'
// app/marketplace/error.tsx
// Profesionální chybová stránka pro Next.js App Router

import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { RefreshCw, AlertTriangle, Home } from 'lucide-react'
import Link from 'next/link'

interface ErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function MarketplaceError({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Logování do monitoring systému (Sentry, LogRocket…)
    console.error('[Marketplace Error]', error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md text-center"
      >
        {/* Ikona */}
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-100">
          <AlertTriangle className="h-8 w-8 text-red-500" />
        </div>

        {/* Text */}
        <h2 className="mb-2 text-xl font-bold text-slate-900">
          Databáze se odmlčela
        </h2>
        <p className="mb-2 text-sm text-slate-500">
          Nepodařilo se načíst nabídky. Může jít o dočasný výpadek – zkuste to znovu.
        </p>

        {/* Debug info (jen ve vývoji) */}
        {process.env.NODE_ENV === 'development' && (
          <details className="mb-6 rounded-lg border border-slate-200 bg-slate-50 p-3 text-left text-xs text-slate-600">
            <summary className="cursor-pointer font-mono font-semibold">
              Detail chyby (pouze dev)
            </summary>
            <pre className="mt-2 overflow-auto whitespace-pre-wrap break-all">
              {error.message}
              {error.digest && `\nDigest: ${error.digest}`}
            </pre>
          </details>
        )}

        {/* Akce */}
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            onClick={reset}
            className="btn-primary"
          >
            <RefreshCw className="h-4 w-4" />
            Zkusit znovu
          </button>
          <Link href="/" className="btn-secondary">
            <Home className="h-4 w-4" />
            Zpět domů
          </Link>
        </div>
      </motion.div>
    </div>
  )
}
