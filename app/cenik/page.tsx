// app/cenik/page.tsx
import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Ceník',
  description:
    'Jeden jednoduchý plán pro poskytovatele. 299 Kč měsíčně, žádné provize z vašich zakázek. První měsíc zdarma.',
}

const features = [
  'Neomezený počet nabídek služeb',
  'Ověřený profil s vaším IČO přes ARES',
  'Recenze a hodnocení od zákazníků',
  'Online rezervace a kalendář termínů',
  '0 % provize z vašich zakázek',
  'Zabezpečené platby přes Stripe',
  'Profil ve vyhledávání a všech kategoriích',
]

function Check() {
  return (
    <svg
      className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-500"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

export default function CenikPage() {
  return (
    <main className="bg-slate-50">
      {/* Hlavička */}
      <section className="mx-auto max-w-3xl px-6 pt-16 pb-10 text-center md:pt-24">
        <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1.5 text-sm font-semibold text-emerald-700">
          Jednoduchý ceník
        </span>
        <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-slate-900 md:text-5xl">
          Jeden plán. Žádné provize.
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-slate-600">
          Platíte jen měsíční předplatné. Z vašich zakázek si nebereme ani korunu –
          co si vyděláte, je vaše.
        </p>
      </section>

      {/* Cenová karta */}
      <section className="mx-auto max-w-md px-6 pb-8">
        <div className="relative rounded-3xl bg-white p-8 shadow-xl ring-1 ring-slate-200">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2">
            <span className="rounded-full bg-emerald-500 px-4 py-1 text-xs font-bold uppercase tracking-wide text-white shadow">
              První měsíc zdarma
            </span>
          </div>

          <div className="pt-3 text-center">
            <h2 className="text-lg font-bold text-slate-900">Předplatné poskytovatele</h2>

            <div className="mt-4 flex items-end justify-center gap-1">
              <span className="text-5xl font-extrabold tracking-tight text-slate-900">299 Kč</span>
              <span className="mb-2 text-slate-500">/ měsíc</span>
            </div>

            <p className="mt-2 text-sm text-slate-500">
              nebo <span className="font-semibold text-slate-700">2 990 Kč / rok</span> –
              ušetříte 598 Kč (2 měsíce zdarma)
            </p>
          </div>

          <ul className="mt-8 space-y-3">
            {features.map((f) => (
              <li key={f} className="flex items-start gap-3 text-slate-700">
                <Check />
                <span>{f}</span>
              </li>
            ))}
          </ul>

          <Link
            href="/registrace/zivnostnik"
            className="mt-8 block w-full rounded-xl bg-emerald-500 px-6 py-3.5 text-center text-base font-bold text-white transition hover:bg-emerald-600"
          >
            Začít zdarma
          </Link>

          <p className="mt-4 text-center text-xs leading-relaxed text-slate-400">
            První měsíc zdarma s uloženou kartou, jednou na IČO. Poté 299 Kč měsíčně.
            Zrušíte kdykoli.
          </p>
        </div>
      </section>

      {/* Vysvětlení 0 % provize */}
      <section className="mx-auto max-w-3xl px-6 py-12">
        <div className="grid gap-6 md:grid-cols-3">
          <div className="rounded-2xl bg-white p-6 ring-1 ring-slate-200">
            <div className="text-2xl">💸</div>
            <h3 className="mt-3 font-bold text-slate-900">0 % provize</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Na rozdíl od jiných platforem si z vašich zakázek nebereme žádné procento.
              Platíte jen pevné předplatné.
            </p>
          </div>
          <div className="rounded-2xl bg-white p-6 ring-1 ring-slate-200">
            <div className="text-2xl">🛡️</div>
            <h3 className="mt-3 font-bold text-slate-900">Ověření zákazníci</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Zákazník skládá rezervační zálohu přes Propojo – máte jistotu, že to
              myslí vážně, a méně zrušených termínů.
            </p>
          </div>
          <div className="rounded-2xl bg-white p-6 ring-1 ring-slate-200">
            <div className="text-2xl">🚫</div>
            <h3 className="mt-3 font-bold text-slate-900">Žádný závazek</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Vyzkoušejte první měsíc zdarma. Pokud vám to nesedne, jednoduše zrušíte –
              bez sankcí a smluv na dobu určitou.
            </p>
          </div>
        </div>
      </section>

      {/* CTA pruh */}
      <section className="mx-auto max-w-3xl px-6 pb-20">
        <div className="rounded-3xl bg-slate-900 px-8 py-12 text-center text-white">
          <h2 className="text-2xl font-extrabold md:text-3xl">Připraveni získat zákazníky?</h2>
          <p className="mx-auto mt-3 max-w-md text-slate-300">
            Založte si profil a první měsíc je na nás.
          </p>
          <Link
            href="/registrace/zivnostnik"
            className="mt-6 inline-block rounded-xl bg-white px-7 py-3.5 text-base font-bold text-slate-900 transition hover:scale-[1.03]"
          >
            Začít zdarma
          </Link>
        </div>
      </section>
    </main>
  )
}
