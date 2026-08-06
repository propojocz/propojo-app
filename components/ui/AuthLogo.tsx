// components/ui/AuthLogo.tsx
// Logo pro přihlašovací a registrační stránku — symbol nad názvem,
// vycentrované. Vlož na vrch formuláře:  <AuthLogo />
import Link from 'next/link'
import Image from 'next/image'

export default function AuthLogo() {
  return (
    <Link href="/" className="mb-8 flex flex-col items-center gap-3">
      <Image
        src="/propojo-symbol.png"
        alt="Propojo"
        width={200}
        height={135}
        priority
        className="h-16 w-auto object-contain"
      />
      <span
        className="text-2xl font-extrabold tracking-tight text-slate-900"
        style={{ fontFamily: 'Poppins, system-ui, sans-serif' }}
      >
        Propojo
      </span>
    </Link>
  )
}