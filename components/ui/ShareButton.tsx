'use client'
// components/ui/ShareButton.tsx

import { useState } from 'react'
import { Share2, Copy, Check } from 'lucide-react'

interface ShareButtonProps {
  url: string
  title?: string
  variant?: 'icon' | 'full'
}

export default function ShareButton({ url, title = 'Propojo', variant = 'full' }: ShareButtonProps) {
  const [copied, setCopied] = useState(false)

  const handleShare = async () => {
    // Na mobilu použij Web Share API pokud je dostupné
    if (navigator.share) {
      try {
        await navigator.share({ title, url })
        return
      } catch {
        // Uživatel zrušil sdílení – fallback na kopírování
      }
    }

    // Desktop – zkopíruj do schránky
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // Fallback pro starší prohlížeče
      const input = document.createElement('input')
      input.value = url
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      document.body.removeChild(input)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    }
  }

  if (variant === 'icon') {
    return (
      <button
        onClick={handleShare}
        title="Sdílet profil"
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-all hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600"
      >
        {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Share2 className="h-4 w-4" />}
      </button>
    )
  }

  return (
    <button
      onClick={handleShare}
      className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-all ${
        copied
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
          : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700'
      }`}
    >
      {copied ? (
        <><Check className="h-4 w-4" /> Odkaz zkopírován!</>
      ) : (
        <><Copy className="h-4 w-4" /> Sdílet profil</>
      )}
    </button>
  )
}
