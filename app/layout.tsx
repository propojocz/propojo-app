// app/layout.tsx
import type { Metadata } from 'next'
import './globals.css'
import Navbar from '@/components/ui/Navbar'
import Footer from '@/components/ui/Footer'
import SiteChrome from '@/components/ui/SiteChrome'
import CookieBanner from '@/components/ui/CookieBanner'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://propojo.cz'

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: 'Propojo | Marketplace pro živnostníky',
    template: '%s | Propojo',
  },
  description: 'Najděte ověřeného řemeslníka nebo nabídněte své služby. Elektrikáři, instalatéři, malíři a stovky dalších živnostníků ve vašem okolí.',
  keywords: ['živnostník', 'řemeslník', 'elektrikář', 'instalatér', 'malíř', 'marketplace', 'česká republika'],
  authors: [{ name: 'Propojo', url: APP_URL }],
  creator: 'Propojo',
  publisher: 'Propojo',
  openGraph: {
    type: 'website',
    locale: 'cs_CZ',
    siteName: 'Propojo',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Propojo | Marketplace pro živnostníky',
    description: 'Najděte ověřeného řemeslníka nebo nabídněte své služby.',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="cs" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
      </head>
      <body className="flex min-h-screen flex-col bg-slate-50 antialiased">
        <SiteChrome navbar={<Navbar />} footer={<Footer />}>
          {children}
        </SiteChrome>
        <CookieBanner />
      </body>
    </html>
  )
}