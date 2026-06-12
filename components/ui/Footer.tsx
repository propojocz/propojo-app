// components/ui/Footer.tsx
import Link from 'next/link'
import Image from 'next/image'

export default function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/propojo-logo.png" alt="Propojo" width={100} height={32} className="h-8 w-auto object-contain" />
          </Link>

          <nav className="flex flex-wrap justify-center gap-x-6 gap-y-1">
            {[
              { href: "/marketplace", label: "Marketplace" },
              { href: "/jak-to-funguje", label: "Jak to funguje" },
              { href: '/pridat-sluzbu', label: 'Přidat službu' },
              { href: '/faq', label: 'FAQ' },
              { href: '/pravidla-komunity', label: 'Pravidla' },
              { href: '/storno', label: 'Storno' },
              { href: '/podminky', label: 'Podmínky' },
              { href: '/soukromi', label: 'Soukromí' },
            ].map((link) => (
              <Link key={link.href} href={link.href} className="text-xs text-slate-500 hover:text-slate-800">
                {link.label}
              </Link>
            ))}
          </nav>

          <p className="text-xs text-slate-400">© {new Date().getFullYear()} Propojo</p>
        </div>
      </div>
    </footer>
  )
}
