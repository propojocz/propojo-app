// app/poptavky/page.tsx
// Nástěnka poptávek pro POSKYTOVATELE. Nahrazuje starý model „prodej leadů"
// (kontakt za předplatné) modelem „Mám zájem": poskytovatel projeví zájem, vznikne
// konverzace, kontakt zákazníka zůstává skrytý až do výběru.
//
// MVP záměrně bez tvrdého matchingu: viditelné jsou VŠECHNY otevřené a nevypršelé
// poptávky. Obor (subcategory_id/category) a město slouží jen k doporučenému
// řazení a volitelným filtrům, ne k blokování. Dávkování a radius přijdou později.
//
// Data se čtou přes service-role klienta (RLS na requests/request_responses je
// zamčená), samotné akce (Mám zájem) běží v komponentě přes expressInterest.

import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import Link from 'next/link'
import { Megaphone, Lock } from 'lucide-react'
import PoptavkyBoard, { type BoardRequest, type ProviderCard } from '@/components/ui/PoptavkyBoard'

export const metadata = { title: 'Poptávky | Propojo' }
export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

const ACTIVE = new Set(['interested', 'negotiating'])

export default async function PoptavkyPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const admin = getAdminClient()

  // Nástěnka visících poptávek je jen pro poskytovatele (= platící). Zákazník
  // poptávky nepotřebuje procházet — zadává je a spravuje v /dashboard/poptavky.
  let isProvider = false
  if (user) {
    const { data: profile } = await admin
      .from('profiles').select('is_provider').eq('id', user.id).maybeSingle() as { data: { is_provider: boolean } | null }
    isProvider = profile?.is_provider === true
  }
  if (!isProvider) {
    return <PoptavkyGate isLoggedIn={!!user} />
  }

  // Otevřené, nevypršelé poptávky.
  const { data: reqs } = await admin
    .from('requests')
    .select('id, category, subcategory_id, city, description, preferred_date, photos, created_at')
    .eq('status', 'open')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(100) as { data: Array<{
      id: string; category: string | null; subcategory_id: string | null
      city: string; description: string; preferred_date: string | null
      photos: string[] | null; created_at: string
    }> | null }
  const requests = reqs ?? []
  const reqIds = requests.map((r) => r.id)

  // Reakce na tyhle poptávky (na počet zájemců + můj stav).
  let responses: Array<{ id: string; request_id: string; provider_id: string; status: string }> = []
  if (reqIds.length) {
    const { data } = await admin
      .from('request_responses')
      .select('id, request_id, provider_id, status')
      .in('request_id', reqIds) as { data: typeof responses | null }
    responses = data ?? []
  }

  // Moje aktivní karty (pro picker u „Mám zájem" a pro řazení podle oboru/města).
  let myCards: ProviderCard[] = []
  const mySubcatSet = new Set<string>()
  const myCatSet = new Set<string>()
  const myCitySet = new Set<string>()
  if (user) {
    const { data: cards } = await admin
      .from('services')
      .select('id, title, category, subcategory_id, city')
      .eq('provider_id', user.id)
      .eq('is_active', true) as { data: Array<{
        id: string; title: string | null; category: string | null
        subcategory_id: string | null; city: string | null
      }> | null }
    myCards = (cards ?? []).map((c) => ({
      id: c.id, title: c.title ?? 'Nabídka', category: c.category, subcategoryId: c.subcategory_id,
    }))
    for (const c of cards ?? []) {
      if (c.subcategory_id) mySubcatSet.add(c.subcategory_id)
      if (c.category) myCatSet.add(c.category.toLowerCase())
      if (c.city) myCitySet.add(c.city.toLowerCase())
    }
    // Další podkategorie karet z propojovací tabulky.
    if (myCards.length) {
      const { data: ssc } = await admin
        .from('service_subcategories')
        .select('subcategory_id')
        .in('service_id', myCards.map((c) => c.id)) as { data: Array<{ subcategory_id: string | null }> | null }
      for (const r of ssc ?? []) if (r.subcategory_id) mySubcatSet.add(r.subcategory_id)
    }
  }

  // Moje reakce → konverzace (pro „Otevřít chat").
  const myResponseIds = user ? responses.filter((r) => r.provider_id === user.id).map((r) => r.id) : []
  const convByResponse = new Map<string, string>()
  if (myResponseIds.length) {
    const { data: convs } = await admin
      .from('conversations')
      .select('id, request_response_id')
      .in('request_response_id', myResponseIds) as { data: Array<{ id: string; request_response_id: string | null }> | null }
    for (const c of convs ?? []) if (c.request_response_id) convByResponse.set(c.request_response_id, c.id)
  }

  // Sestavení karet pro nástěnku + doporučené řazení.
  const cards: BoardRequest[] = requests.map((r) => {
    const rs = responses.filter((x) => x.request_id === r.id)
    const activeCount = rs.filter((x) => ACTIVE.has(x.status)).length
    const mine = user ? rs.find((x) => x.provider_id === user.id) : undefined
    const sameSub = r.subcategory_id ? mySubcatSet.has(r.subcategory_id) : false
    const sameCat = r.category ? myCatSet.has(r.category.toLowerCase()) : false
    const sameCity = r.city ? myCitySet.has(r.city.toLowerCase()) : false
    // Řazení: 0 shoda oboru i města, 1 obor, 2 kategorie, 3 ostatní.
    const rank = sameSub && sameCity ? 0 : sameSub ? 1 : sameCat ? 2 : 3
    return {
      id: r.id,
      category: r.category,
      subcategoryId: r.subcategory_id,
      city: r.city,
      description: r.description,
      preferredDate: r.preferred_date,
      photos: r.photos ?? [],
      createdAt: r.created_at,
      activeCount,
      isFull: activeCount >= 5,
      myStatus: mine?.status ?? null,
      myConversationId: mine ? (convByResponse.get(mine.id) ?? null) : null,
      rank,
      sameCity,
    }
  })

  return (
    <PoptavkyBoard
      cards={cards}
      myCards={myCards}
      isLoggedIn={!!user}
    />
  )
}


// Výzva pro neposkytovatele — nástěnka je výhoda poskytovatelského účtu.
function PoptavkyGate({ isLoggedIn }: { isLoggedIn: boolean }) {
  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center sm:px-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50">
          <Megaphone className="h-6 w-6 text-emerald-600" />
        </div>
        <h1 className="text-xl font-black text-slate-900">Nástěnka poptávek je pro poskytovatele</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-slate-600">
          Poptávky zákazníků vidí poskytovatelé s aktivním účtem. Staňte se poskytovatelem
          a získejte přístup k nové práci ve svém okolí.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          {isLoggedIn ? (
            <Link href="/dashboard/profil" className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-600">
              Stát se poskytovatelem
            </Link>
          ) : (
            <Link href="/prihlasit?next=/poptavky" className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-600">
              Přihlásit se
            </Link>
          )}
          <Link href="/poptavky/nova" className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50">
            Hledáte řemeslníka? Zadejte poptávku
          </Link>
        </div>
        <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-slate-400">
          <Lock className="h-3.5 w-3.5" /> Kontakty zákazníků zůstávají skryté do výběru.
        </p>
      </div>
    </div>
  )
}