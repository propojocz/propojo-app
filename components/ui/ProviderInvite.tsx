'use client'
// components/ui/ProviderInvite.tsx
//
// Zobrazuje se tam, kde chybí pokrytí (prázdné hledání, kategorie bez nabídek,
// hlavní stránka). Oslovuje DVĚ publika najednou:
//
//  1) Řemeslníka  — „buďte ve svém okrese první"
//  2) Zákazníka   — „znáte někoho šikovného? pošlete mu pozvánku"
//
// To druhé je důležitější, než se zdá: tenhle box vidí hlavně zákazník
// (on přece hledal a nenašel), ne řemeslník. Dát mu možnost pozvat někoho,
// koho zná, je nejlevnější nábor, jaký existuje.
//
// Poznámka k textu: název kategorie ZÁMĚRNĚ nepoužíváme uvnitř vět.
// Kategorie nejsou profese („Zvířata", „Auto") a jakákoli věta s nimi zní divně.

import { useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Share2, Check } from 'lucide-react'

interface ProviderInviteProps {
  /** Nepovinné — použije se jen pro text pozvánky, ne do nadpisu. */
  category?: string
  city?: string
  compact?: boolean
}

export default function ProviderInvite({ category, city, compact = false }: ProviderInviteProps) {
  const [copied, setCopied] = useState(false)

  const handleShare = async () => {
    const url = 'https://propojo.cz/registrace/zivnostnik'
    const text =
      'Na Propojo.cz si lidi rezervují řemeslníky online — bez obvolávání. ' +
      'Zakázky bez provizí, první měsíc zdarma. Mrkni na to:'

    // Na mobilu vyvolá systémové sdílení (WhatsApp, Messenger, SMS, e-mail…).
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'Pozvánka na Propojo', text, url })
        return
      } catch {
        // uživatel sdílení zavřel — nic neděláme
        return
      }
    }

    // Na počítači zkopírujeme odkaz do schránky.
    try {
      await navigator.clipboard.writeText(`${text} ${url}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      window.prompt('Zkopírujte odkaz:', url)
    }
  }

  return (
    <div
      className={`rounded-2xl border border-emerald-200 bg-emerald-50 text-center ${
        compact ? 'p-6' : 'p-8 sm:p-10'
      }`}
    >
      {/* ── Řemeslník ── */}
      <h3
        className={`font-black tracking-tight text-slate-900 ${
          compact ? 'text-lg' : 'text-xl sm:text-2xl'
        }`}
      >
        Pro tuto službu tu zatím nikoho nemáme
      </h3>

      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-slate-600">
        Jste řemeslník nebo poskytujete služby?{' '}
        <span className="font-semibold text-slate-800">
          Ve svém okrese můžete být první
        </span>{' '}
        — a zákazníci vás najdou hned.
      </p>

      <Link
        href="/registrace/zivnostnik"
        className="mt-5 inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-emerald-600"
      >
        Přidat svoji nabídku <ArrowRight className="h-4 w-4" />
      </Link>

      <p className="mt-3 text-xs text-slate-500">
        První měsíc zdarma · bez provizí · zrušíte kdykoli
      </p>

      {/* ── Zákazník: pozvěte někoho, koho znáte ── */}
      <div className="mx-auto mt-6 max-w-sm border-t border-emerald-200 pt-5">
        <p className="text-sm text-slate-600">
          Znáte někoho šikovného?
        </p>
        <button
          onClick={handleShare}
          className="mt-2 inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-bold text-emerald-700 transition-colors hover:bg-emerald-100"
        >
          {copied ? (
            <>
              <Check className="h-4 w-4" /> Odkaz zkopírován
            </>
          ) : (
            <>
              <Share2 className="h-4 w-4" /> Pošlete mu pozvánku
            </>
          )}
        </button>
      </div>
    </div>
  )
}