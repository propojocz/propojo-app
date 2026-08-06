// app/prihravka/[token]/page.tsx
// Veřejný náhled přihrávky — sem dorazí kolega z WhatsAppu/IG.
// Ukáže NÁLAKOVÉ údaje (obor, město, cena, kdo přihrává). Celé zadání
// a kontakt zákazníka až po registraci a převzetí.
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getHandoffPublic } from '@/lib/actions/handoffs'
import { createClient } from '@/lib/supabase/server'
import ClaimHandoffButton from '@/components/ui/ClaimHandoffButton'

export const dynamic = 'force-dynamic'

const KAT: Record<string, string> = {
  'dum-a-byt': 'Dům a byt', 'remesla': 'Stavba, rekonstrukce a řemesla',
  'zahrada': 'Zahrada a exteriér', 'uklid': 'Úklid', 'auto': 'Auto',
  'it': 'IT, technika a opravy', 'krasa': 'Krása a péče o tělo',
  'zdravi': 'Zdraví, wellness a sport', 'doucovani': 'Výuka a doučování',
}

export default async function PrihravkaPage({ params }: { params: { token: string } }) {
  const nabidka = await getHandoffPublic(params.token)
  if (!nabidka) notFound()

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const uzVzato = nabidka.status !== 'nabidnuto'
  const katLabel = nabidka.kategorie ? (KAT[nabidka.kategorie] ?? nabidka.kategorie) : null

  return (
    <div className="mx-auto max-w-lg px-4 py-10 sm:px-6">
      {/* Kdo a co */}
      <div className="mb-6 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
          ⚡ Přihrávka zakázky
        </span>
        <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-slate-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
          {nabidka.prihrava ? `${nabidka.prihrava} vám přihrává zakázku` : 'Někdo vám přihrává zakázku'}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Nestíhá ji vzít a myslel si na vás. Když ji vezmete, domluvíte se se zákazníkem přes Propojo.
        </p>
      </div>

      {/* Nálakový náhled */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <dl className="space-y-3">
          {katLabel && (
            <div className="flex justify-between gap-3">
              <dt className="text-sm text-slate-500">Obor</dt>
              <dd className="text-sm font-semibold text-slate-800">{katLabel}</dd>
            </div>
          )}
          {nabidka.sluzba_nazev && (
            <div className="flex justify-between gap-3">
              <dt className="text-sm text-slate-500">Služba</dt>
              <dd className="text-right text-sm font-semibold text-slate-800">{nabidka.sluzba_nazev}</dd>
            </div>
          )}
          {nabidka.mesto && (
            <div className="flex justify-between gap-3">
              <dt className="text-sm text-slate-500">Místo</dt>
              <dd className="text-sm font-semibold text-slate-800">📍 {nabidka.mesto}</dd>
            </div>
          )}
          {nabidka.cena != null && (
            <div className="flex justify-between gap-3 border-t border-slate-100 pt-3">
              <dt className="text-sm text-slate-500">Cena</dt>
              <dd className="text-base font-extrabold text-emerald-700">{nabidka.cena.toLocaleString('cs-CZ')} Kč</dd>
            </div>
          )}
        </dl>

        {/* Co je schované */}
        <div className="mt-4 rounded-xl bg-slate-50 p-3.5">
          <p className="text-xs leading-relaxed text-slate-500">
            🔒 <strong>Jméno a adresu zákazníka</strong> uvidíte, jakmile se přihlásíte a zakázku převezmete.
            Chráníme tím zákazníka i vás.
          </p>
        </div>
      </div>

      {/* Akce */}
      <div className="mt-5">
        {uzVzato ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-center">
            <p className="text-sm font-semibold text-slate-600">Tuhle zakázku už někdo převzal.</p>
            <Link href="/marketplace" className="mt-2 inline-block text-sm font-semibold text-emerald-700 hover:underline">
              Projít další nabídky →
            </Link>
          </div>
        ) : user ? (
          <ClaimHandoffButton token={params.token} />
        ) : (
          <div className="space-y-3">
            <Link
              href={`/registrace?next=/prihravka/${params.token}`}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3.5 text-sm font-bold text-white transition hover:bg-emerald-600"
            >
              Zaregistrovat se a vzít zakázku
            </Link>
            <Link
              href={`/prihlasit?next=/prihravka/${params.token}`}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              Už mám účet — přihlásit se
            </Link>
            <p className="text-center text-xs text-slate-400">
              Registrace je zdarma. Zaplatíte až předplatné, když si necháte kartu zveřejněnou.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}