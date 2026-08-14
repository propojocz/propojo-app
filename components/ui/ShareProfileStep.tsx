'use client'
// components/ui/ShareProfileStep.tsx
// Třetí krok onboardingu na dashboardu. Dřív to byl jen odkaz na vlastní
// profil — slíbil „sdílejte" a otevřel stránku, kde se nic sdílet nedalo.
//
// Teď: na telefonu otevře systémové sdílení (WhatsApp, Messenger, SMS…),
// na počítači zkopíruje odkaz do schránky. Když ani jedno nejde, ukáže
// odkaz v okně, ať si ho člověk označí ručně.

import { useState } from 'react'
import { Share2, Check, ExternalLink } from 'lucide-react'
import Link from 'next/link'

export default function ShareProfileStep({ url }: { url: string }) {
  const [stav, setStav] = useState<'nic' | 'zkopirovano' | 'sdileno'>('nic')

  async function sdilet() {
    const data = {
      title: 'Můj profil na Propojo',
      text: 'Objednejte se u mě přes Propojo:',
      url,
    }

    // 1) Systémové sdílení — telefon
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share(data)
        setStav('sdileno')
        setTimeout(() => setStav('nic'), 3000)
        return
      } catch (err) {
        // Uživatel sdílení zavřel — to není chyba, jen skončíme.
        if ((err as Error)?.name === 'AbortError') return
        // Jiná chyba (starší prohlížeč) → zkusíme schránku níž.
      }
    }

    // 2) Schránka — počítač
    try {
      await navigator.clipboard.writeText(url)
      setStav('zkopirovano')
      setTimeout(() => setStav('nic'), 3000)
    } catch {
      // 3) Poslední záchrana
      window.prompt('Zkopírujte si odkaz na svůj profil:', url)
    }
  }

  const popisek =
    stav === 'zkopirovano'
      ? 'Odkaz zkopírován do schránky'
      : stav === 'sdileno'
        ? 'Odesláno'
        : 'Pošlete odkaz zákazníkům'

  return (
    <div className="rounded-xl transition-all hover:bg-indigo-100">
      <button
        type="button"
        onClick={sdilet}
        className="flex w-full items-center gap-4 rounded-xl p-3 text-left"
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white">
          3
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-indigo-900">Sdílejte profil</p>
          <p className="text-xs text-indigo-600">{popisek}</p>
        </div>
        {stav === 'nic'
          ? <Share2 className="h-4 w-4 shrink-0 text-indigo-400" />
          : <Check className="h-4 w-4 shrink-0 text-emerald-600" />}
      </button>

      <div className="flex items-center justify-between gap-3 px-3 pb-3">
        <p className="truncate text-xs text-indigo-400">{url.replace(/^https?:\/\//, '')}</p>
        <Link
          href={url}
          target="_blank"
          className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
        >
          Zobrazit <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
    </div>
  )
}