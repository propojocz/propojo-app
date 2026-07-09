'use client'
// app/dashboard/MobileDashboardNav.tsx
//
// ZÁMĚRNĚ PRÁZDNÝ (nic nevykresluje).
//
// Mobilní navigaci dashboardu dřív řešil tento komponent (vlastní horní proužek,
// fialový drawer a spodní tab bar). To celé teď zastává univerzální horní menu
// components/ui/MobileNav.tsx (pilulka ☰ + profil), které funguje na všech
// stránkách včetně dashboardu a obsahuje kompletní nabídku i odznaky.
//
// Komponent tu zůstává jen proto, aby ho app/dashboard/layout.tsx mohl dál
// importovat a předávat mu propsy beze změny — vrací však null, takže se
// nezobrazuje žádný druhý hamburger, žádné fialové menu ani spodní lišta.

interface NavItem {
  href: string
  label: string
  icon: string
}

interface Props {
  nav: NavItem[]
  isProvider: boolean
  profileName: string
  isAdmin?: boolean
  disputeCount?: number
}

export default function MobileDashboardNav(_props: Props) {
  return null
}