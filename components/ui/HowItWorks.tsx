'use client'
// components/ui/HowItWorks.tsx
// Úvodní stránka – „Jak to funguje“ podle mockupu Mateje (19. 10. 2026), v barvách Propoja.
// Počítač: karta se třemi kroky vlevo přes velký obrázek vpravo. Mobil: obrázek nahoře, karta pod ním.
// Obrázek nahrává admin (/admin/obrazky), vybírá se náhodně (getHomepageImage); bez něj barevné pozadí.
// Kolem jemné barevné kruhy v barvách loga – jen barevný přechod (žádný blur filtr, na telefonu nezpomaluje),
// za obsahem, neklikací, bez pohybu.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, CalendarCheck, CreditCard, Search } from 'lucide-react'
import { getHomepageImage } from '@/lib/actions/homepage-images'

type Img = { image_url: string; alt: string; link_url: string | null }

const STEPS = [
  { n: 1, dot: 'bg-sky-100 text-sky-800', title: 'Vyberte si službu', text: 'Prohlédněte si nabídky a ukázky práce.' },
  { n: 2, dot: 'bg-emerald-100 text-emerald-800', title: 'Zvolte místo a termín', text: 'Vyberte si, kde a kdy službu potřebujete.' },
  { n: 3, dot: 'bg-orange-100 text-orange-800', title: 'Rezervujte a zaplaťte', text: 'Rezervační poplatek zaplatíte kartou, potvrzení přijde e-mailem.' },
]

// Barevné kruhy v barvách loga (modrá, oranžová, zelená)
const BLOBS: { cls: string; color: string }[] = [
  { cls: '-left-24 -top-16 h-80 w-80', color: 'rgba(59,130,246,0.16)' },
  { cls: '-right-24 -top-10 h-72 w-72', color: 'rgba(249,115,22,0.14)' },
  { cls: '-bottom-24 -left-16 h-72 w-72', color: 'rgba(16,185,129,0.14)' },
  { cls: '-bottom-20 -right-16 h-80 w-80', color: 'rgba(59,130,246,0.12)' },
]

export default function HowItWorks() {
  const [img, setImg] = useState<Img | null | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    getHomepageImage().then((r) => { if (!cancelled) setImg(r) }).catch(() => { if (!cancelled) setImg(null) })
    return () => { cancelled = true }
  }, [])

  const picture = img ? (
    <Image src={img.image_url} alt={img.alt} fill sizes="(min-width: 768px) 60vw, 100vw" className="object-cover" />
  ) : (
    // Bez obrázku (nebo než se načte): barevné pozadí s ikonami kroků
    <div className="flex h-full w-full items-center justify-center gap-6 bg-gradient-to-br from-sky-50 via-emerald-50 to-orange-50" aria-hidden="true">
      <Search className="h-10 w-10 text-sky-300" />
      <CalendarCheck className="h-12 w-12 text-emerald-300" />
      <CreditCard className="h-10 w-10 text-orange-300" />
    </div>
  )

  return (
    <section id="jak" className="relative overflow-hidden px-4 py-14 sm:px-6 md:py-20">
      {BLOBS.map((b) => (
        <span key={b.cls} aria-hidden="true" className={`pointer-events-none absolute rounded-full ${b.cls}`}
          style={{ background: `radial-gradient(circle, ${b.color} 0%, transparent 70%)` }} />
      ))}

      <div className="relative mx-auto max-w-6xl md:grid md:grid-cols-12 md:items-center">
        {/* Obrázek: mobil nahoře, počítač vpravo pod kartou */}
        <div className="relative h-56 overflow-hidden rounded-t-3xl border border-slate-200/70 sm:h-72 md:col-span-8 md:col-start-5 md:row-start-1 md:h-[460px] md:rounded-3xl">
          {img?.link_url
            ? <Link href={img.link_url} className="absolute inset-0 block" aria-label={img.alt}>{picture}</Link>
            : picture}
        </div>

        {/* Karta s kroky: mobil přes spodní okraj obrázku, počítač vlevo přes obrázek */}
        <div className="relative z-10 -mt-8 rounded-3xl bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_24px_48px_-24px_rgba(15,23,42,0.25)] sm:p-8 md:col-span-5 md:col-start-1 md:row-start-1 md:mt-0">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-600">Jak to funguje</p>
          <h2 className="mt-3 text-3xl font-black leading-tight tracking-tight text-slate-900 sm:text-4xl">
            Službu najdete.<br />
            <span className="text-emerald-600">Termín</span> si domluvíte.
          </h2>
          <ol className="mt-7 space-y-5">
            {STEPS.map((s) => (
              <li key={s.n} className="flex items-center gap-4">
                <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-xl font-black ${s.dot}`}>{s.n}</span>
                <div>
                  <p className="font-bold text-slate-900">{s.title}</p>
                  <p className="text-sm text-slate-600">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
          <Link href="/marketplace" className="mt-7 inline-flex items-center gap-2 font-bold text-emerald-700 transition hover:gap-3 hover:text-emerald-800">
            Prohlédnout služby <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  )
}
