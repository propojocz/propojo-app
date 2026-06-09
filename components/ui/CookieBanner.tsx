'use client'
// components/ui/CookieBanner.tsx – GDPR cookie lišta

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'

type CookieConsent = {
  necessary: true
  analytics: boolean
  marketing: boolean
}

export default function CookieBanner() {
  const [visible, setVisible] = useState(false)
  const [showDetail, setShowDetail] = useState(false)
  const [prefs, setPrefs] = useState<CookieConsent>({
    necessary: true,
    analytics: false,
    marketing: false,
  })

  useEffect(() => {
    const saved = localStorage.getItem('propojo_cookie_consent')
    if (!saved) setVisible(true)
  }, [])

  const save = (consent: CookieConsent) => {
    localStorage.setItem('propojo_cookie_consent', JSON.stringify(consent))
    setVisible(false)
  }

  const acceptAll = () => save({ necessary: true, analytics: true, marketing: true })
  const acceptNecessary = () => save({ necessary: true, analytics: false, marketing: false })
  const saveCustom = () => save(prefs)

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-2xl"
        >
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl shadow-slate-900/10">
            {!showDetail ? (
              <>
                <div className="mb-4 flex items-start gap-3">
                  <span className="text-2xl">🍪</span>
                  <div>
                    <p className="font-bold text-slate-900">Používáme cookies</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                      Cookies nám pomáhají zlepšovat váš zážitek. Nezbytné cookies jsou vždy aktivní.{' '}
                      <Link href="/soukromi" className="text-indigo-600 hover:underline">
                        Zásady ochrany soukromí
                      </Link>
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={acceptAll} className="btn-primary text-xs px-4 py-2">
                    Přijmout vše
                  </button>
                  <button onClick={acceptNecessary} className="btn-secondary text-xs px-4 py-2">
                    Jen nezbytné
                  </button>
                  <button
                    onClick={() => setShowDetail(true)}
                    className="text-xs text-slate-500 underline hover:text-slate-800 px-2"
                  >
                    Nastavit
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="mb-4 font-bold text-slate-900">Nastavení cookies</p>
                <div className="mb-4 space-y-3">
                  {[
                    { key: 'necessary' as const, label: 'Nezbytné', desc: 'Přihlášení, košík, zabezpečení. Nelze vypnout.', locked: true },
                    { key: 'analytics' as const, label: 'Analytické', desc: 'Pomáhají nám pochopit jak web používáte.', locked: false },
                    { key: 'marketing' as const, label: 'Marketingové', desc: 'Personalizace reklam a obsahu.', locked: false },
                  ].map(item => (
                    <div key={item.key} className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{item.label}</p>
                        <p className="text-xs text-slate-500">{item.desc}</p>
                      </div>
                      <button
                        onClick={() => !item.locked && setPrefs(p => ({ ...p, [item.key]: !p[item.key] }))}
                        disabled={item.locked}
                        className={`relative h-6 w-11 rounded-full transition-colors ${
                          prefs[item.key] ? 'bg-indigo-600' : 'bg-slate-300'
                        } ${item.locked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                      >
                        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                          prefs[item.key] ? 'left-5' : 'left-0.5'
                        }`} />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={saveCustom} className="btn-primary flex-1 text-xs px-4 py-2">
                    Uložit nastavení
                  </button>
                  <button onClick={() => setShowDetail(false)} className="btn-secondary text-xs px-4 py-2">
                    Zpět
                  </button>
                </div>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
