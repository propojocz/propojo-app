// lib/categoryIcons.tsx
// Jedno místo, kde se kategorie překládá na ikonu. Dřív se ikona brala z DB
// (`categories.icon` = emoji) a vypisovala jako text — emoji vypadají v každém
// systému jinak a působí lacině. Teď se z DB bere jen slug a ikonu určuje kód.
//
// Klíč je SLUG kategorie (stabilní), ne název.
//
// POZOR na verze lucide-react: novější názvy ikon (HeartHandshake, PartyPopper,
// Sprout, Dumbbell…) ve starších verzích neexistují a import pak vrátí
// `undefined` → React spadne na „Element type is invalid ... got: undefined".
// Proto: (1) používáme jen dlouho zavedené názvy, (2) render má pojistku a
// radši nevykreslí nic, než aby shodil stránku.

import type { LucideIcon } from 'lucide-react'
import {
  Home, Hammer, Leaf, Sparkles, Truck, Car, Laptop, Globe,
  Scissors, Activity, Users, GraduationCap, PawPrint,
  Scale, Briefcase, Gift, Tag,
} from 'lucide-react'

export const CATEGORY_ICONS: Record<string, LucideIcon | undefined> = {
  'dum-a-byt': Home,          // Dům a byt
  'remesla': Hammer,          // Stavba, rekonstrukce a řemesla
  'zahrada': Leaf,            // Zahrada a exteriér
  'uklid': Sparkles,          // Úklid
  'stehovani': Truck,         // Stěhování a transport
  'auto': Car,                // Auto
  'it': Laptop,               // IT, technika a opravy
  'online': Globe,            // Digitální a odborné služby
  'krasa': Scissors,          // Krása a péče o tělo
  'zdravi': Activity,         // Zdraví, wellness a sport
  'pece-o-lidi': Users,       // Péče o lidi
  'doucovani': GraduationCap, // Výuka a doučování
  'zvirata': PawPrint,        // Zvířata
  'pravo-finance': Scale,     // Právo, finance a pojištění
  'firmy': Briefcase,         // Služby pro firmy
  'udalosti': Gift,           // Události a volný čas
}

/** Vrátí ikonu pro slug. Když slug neznáme nebo ikona ve verzi lucide chybí,
 *  vrátí náhradní Tag — a když ani ten neexistuje, `undefined`. */
export function categoryIcon(slug?: string | null): LucideIcon | undefined {
  return (slug ? CATEGORY_ICONS[slug] : undefined) ?? Tag ?? undefined
}

interface CategoryIconProps {
  slug?: string | null
  /** Velikost a barva samotné ikony. */
  className?: string
  /** true = ikona v zeleném zaobleném čtverečku (dlaždice ve formuláři). */
  boxed?: boolean
  /** Velikost čtverečku, když boxed. */
  boxClassName?: string
}

export function CategoryIcon({
  slug,
  className = 'h-5 w-5',
  boxed = false,
  boxClassName = 'h-9 w-9 rounded-xl',
}: CategoryIconProps) {
  const Icon = categoryIcon(slug)

  // Pojistka: nikdy nevykreslit `undefined` jako komponentu.
  if (!Icon) return boxed
    ? <span className={`shrink-0 bg-emerald-50 ${boxClassName}`} />
    : null

  if (!boxed) return <Icon className={className} />

  return (
    <span className={`flex shrink-0 items-center justify-center bg-emerald-50 text-emerald-600 ${boxClassName}`}>
      <Icon className={className} />
    </span>
  )
}