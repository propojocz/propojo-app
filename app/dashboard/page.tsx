// app/dashboard/page.tsx
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Package, ShoppingBag, TrendingUp, Star, ArrowRight, PlusCircle, Search, ChevronRight, Heart, CalendarDays } from 'lucide-react'
import { CATEGORY_META } from '@/types/database'
import type { Profile } from '@/types/database'
import Avatar from '@/components/ui/Avatar'
import FreeSlotReminder, { NoFreeSlotHint, type ReminderSlot } from '@/components/ui/FreeSlotReminder'
import PushPrompt from '@/components/ui/PushPrompt'
import ShareProfileStep from '@/components/ui/ShareProfileStep'

export const metadata = { title: 'Dashboard | Propojo' }

export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/prihlasit?next=/dashboard')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single() as { data: Profile | null }

  const isProvider = profile?.is_provider === true

  // ── DATA PRO ŽIVNOSTNÍKA ──────────────────────────────────
  if (isProvider) {
    const [
      { count: servicesCount },
      { count: activeServicesCount },
      { count: pendingOrdersCount },
      { count: totalOrdersCount },
      { data: recentServices },
      { data: recentOrders },
      { data: freeSlots },
    ] = await Promise.all([
      supabase.from('services').select('id', { count: 'exact', head: true }).eq('provider_id', user.id),
      supabase.from('services').select('id', { count: 'exact', head: true }).eq('provider_id', user.id).eq('is_active', true),
      supabase.from('orders').select('id', { count: 'exact', head: true }).eq('provider_id', user.id).eq('status', 'cekajici'),
      supabase.from('orders').select('id', { count: 'exact', head: true }).eq('provider_id', user.id),
      supabase.from('services').select('id, title, category, price, price_unit, is_active').eq('provider_id', user.id).order('created_at', { ascending: false }).limit(5),
      supabase.from('orders').select('id, status, created_at, services(title), profiles!orders_customer_id_fkey(full_name)').eq('provider_id', user.id).order('created_at', { ascending: false }).limit(5),
      // Volná okna, o kterých ještě nikdo neví — hlavní featura Propojo,
      // proto patří na dashboard, ne do podmenu.
      supabase
        .from('availability_slots')
        .select('id, starts_at, ends_at, slot_services(services(title))')
        .eq('provider_id', user.id)
        .eq('status', 'volno')
        .eq('pending_confirm', false)
        .gte('starts_at', new Date().toISOString())
        .order('starts_at', { ascending: true })
        .limit(10),
    ])

    // Které z těch oken už mají rozeslané upozornění? Čte se přes service role —
    // slot_notifications má RLS „vidím jen svoje", takže poskytovatel by přes
    // běžného klienta neviděl nic a připomínka by se ukazovala pořád dokola.
    const slotRows = (freeSlots ?? []) as any[]
    let reminder: ReminderSlot | null = null

    if (slotRows.length > 0) {
      const adminDb = createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )
      const { data: notified } = await adminDb
        .from('slot_notifications')
        .select('slot_id')
        .in('slot_id', slotRows.map((s) => s.id))

      const notifiedSet = new Set((notified ?? []).map((n: any) => n.slot_id))
      const silent = slotRows.filter((s) => !notifiedSet.has(s.id))

      if (silent.length > 0) {
        const s = silent[0]
        const den = new Intl.DateTimeFormat('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric' }).format(new Date(s.starts_at))
        const od = new Intl.DateTimeFormat('cs-CZ', { hour: '2-digit', minute: '2-digit' }).format(new Date(s.starts_at))
        const doC = new Intl.DateTimeFormat('cs-CZ', { hour: '2-digit', minute: '2-digit' }).format(new Date(s.ends_at))
        const names = (s.slot_services ?? [])
          .map((l: any) => l.services?.title)
          .filter(Boolean)
          .join(' · ')

        reminder = {
          id: s.id,
          label: `${den} · ${od}–${doC}`,
          services: names,
          moreCount: silent.length - 1,
        }
      }
    }

    // Odkaz na veřejný profil — musí být úplný, protože ho poskytovatel
    // posílá ven (do WhatsAppu, na Facebook). Relativní adresa by se ve
    // sdílení rozbila.
    const profileUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://propojo.cz'}/profil/${user.id}`

    const statusColors: Record<string, string> = {
      cekajici: 'bg-amber-100 text-amber-700',
      prijato: 'bg-blue-100 text-blue-700',
      v_procesu: 'bg-indigo-100 text-indigo-700',
      dokonceno: 'bg-emerald-100 text-emerald-700',
      zruseno: 'bg-red-100 text-red-700',
    }
    const statusLabels: Record<string, string> = {
      cekajici: 'Čeká', prijato: 'Přijato', v_procesu: 'V procesu', dokonceno: 'Dokončeno', zruseno: 'Zrušeno',
    }

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-slate-900">Dobrý den, {profile?.full_name?.split(' ')[0]} 👋</h1>
            <p className="mt-0.5 text-sm text-slate-500">{new Intl.DateTimeFormat('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</p>
          </div>
          <div className="hidden shrink-0 gap-2 sm:flex">
            <Link href="/dashboard/terminy" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 font-semibold text-slate-700 transition hover:border-emerald-300 hover:text-emerald-700">
              <CalendarDays className="h-4 w-4" /> Volný termín
            </Link>
            <Link href="/pridat-sluzbu" className="btn-primary">
              <PlusCircle className="h-4 w-4" /> Nová nabídka
            </Link>
          </div>
        </div>

        {/* Volný termín, o kterém nikdo neví — nejvýš, hned na očích */}
        {reminder ? <FreeSlotReminder slot={reminder} /> : (servicesCount ?? 0) > 0 && <NoFreeSlotHint />}

        {/* Upozornění do telefonu — schová se samo, když je prohlížeč nepodporuje */}
        <PushPrompt />

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { label: 'Aktivní nabídky', value: activeServicesCount ?? 0, sub: `z ${servicesCount ?? 0} celkem`, icon: Package, color: 'indigo', href: '/dashboard/nabidky' },
            { label: 'Čekající poptávky', value: pendingOrdersCount ?? 0, sub: `z ${totalOrdersCount ?? 0} celkem`, icon: ShoppingBag, color: 'amber', href: '/dashboard/objednavky' },
            { label: 'Celkem objednávek', value: totalOrdersCount ?? 0, sub: 'od spuštění', icon: TrendingUp, color: 'emerald', href: '/dashboard/objednavky' },
            { label: 'Hodnocení', value: profile?.rating ? `${Number(profile.rating).toFixed(1)} ★` : '—', sub: `${profile?.review_count ?? 0} recenzí`, icon: Star, color: 'violet', href: '/dashboard/profil' },
          ].map((stat) => (
            <Link key={stat.label} href={stat.href} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
              <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-${stat.color}-100`}>
                <stat.icon className={`h-5 w-5 text-${stat.color}-600`} />
              </div>
              <p className="text-2xl font-black text-slate-900">{stat.value}</p>
              <p className="mt-0.5 text-xs text-slate-500">{stat.label}</p>
              <p className="mt-0.5 text-xs text-slate-400">{stat.sub}</p>
            </Link>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Nabídky */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="font-bold text-slate-900">Moje nabídky</h2>
              <Link href="/dashboard/nabidky" className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700">Všechny <ArrowRight className="h-3 w-3" /></Link>
            </div>
            {recentServices && recentServices.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {recentServices.map((s: any) => (
                  <Link key={s.id} href={`/sluzby/${s.id}`} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-slate-50">
                    <span className="text-xl">{CATEGORY_META[s.category as keyof typeof CATEGORY_META]?.emoji ?? '📦'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-800">{s.title}</p>
                      <p className="text-xs text-slate-400">{(s.price ?? 0) > 0 ? `${Number(s.price).toLocaleString('cs-CZ')} Kč/${s.price_unit}` : 'Nacenění / dohodou'}</p>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {s.is_active ? 'Aktivní' : 'Skrytá'}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="px-5 py-10 text-center">
                <p className="mb-3 text-sm text-slate-500">Zatím žádné nabídky</p>
                <Link href="/pridat-sluzbu" className="btn-primary text-sm"><PlusCircle className="h-4 w-4" /> Přidat první nabídku</Link>
              </div>
            )}
          </div>

          {/* Objednávky */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="font-bold text-slate-900">Poslední poptávky</h2>
              <Link href="/dashboard/objednavky" className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700">Všechny <ArrowRight className="h-3 w-3" /></Link>
            </div>
            {recentOrders && recentOrders.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {recentOrders.map((o: any) => (
                  <Link key={o.id} href={`/dashboard/objednavky/${o.id}`} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-slate-50">
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-800">{o.services?.title ?? 'Neznámá služba'}</p>
                      <p className="text-xs text-slate-400">{o.profiles?.full_name ?? 'Zákazník'} · {new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'short' }).format(new Date(o.created_at))}</p>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[o.status] ?? 'bg-slate-100 text-slate-500'}`}>{statusLabels[o.status] ?? o.status}</span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                  </Link>
                ))}
              </div>
            ) : (
              <div className="px-5 py-10 text-center">
                <p className="text-sm text-slate-500">Zatím žádné poptávky</p>
              </div>
            )}
          </div>
        </div>

        {/* Onboarding */}
        {(servicesCount ?? 0) === 0 && (
          <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-6">
            <h3 className="mb-4 font-bold text-indigo-900">🚀 Začněte vydělávat – 3 kroky</h3>
            <div className="space-y-3">
              {[
                { step: 1, label: 'Doplňte profil', desc: 'Přidejte bio a kontakt', href: '/dashboard/profil', done: !!profile?.bio },
                { step: 2, label: 'Přidejte nabídku', desc: 'Popište co umíte a nastavte cenu', href: '/pridat-sluzbu', done: (servicesCount ?? 0) > 0 },
              ].map((item) => (
                <Link key={item.step} href={item.href} className={`flex items-center gap-4 rounded-xl p-3 transition-all hover:bg-indigo-100 ${item.done ? 'opacity-60' : ''}`}>
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${item.done ? 'bg-emerald-500 text-white' : 'bg-indigo-600 text-white'}`}>
                    {item.done ? '✓' : item.step}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-indigo-900">{item.label}</p>
                    <p className="text-xs text-indigo-600">{item.desc}</p>
                  </div>
                  {!item.done && <ArrowRight className="h-4 w-4 text-indigo-400" />}
                </Link>
              ))}

              {/* Třetí krok opravdu sdílí — systémové sdílení na telefonu,
                  kopie odkazu na počítači. Dřív jen otevřel profil. */}
              <ShareProfileStep url={profileUrl} />
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── DASHBOARD PRO ZÁKAZNÍKA ──────────────────────────────
  const [
    { count: totalOrders },
    { count: activeOrders },
    { data: myOrders },
    { data: favorites },
  ] = await Promise.all([
    supabase.from('orders').select('id', { count: 'exact', head: true }).eq('customer_id', user.id),
    supabase.from('orders').select('id', { count: 'exact', head: true }).eq('customer_id', user.id).in('status', ['cekajici', 'prijato', 'v_procesu']),
    supabase.from('orders').select('id, status, created_at, services(title, price, price_unit), profiles!orders_provider_id_fkey(full_name)').eq('customer_id', user.id).order('created_at', { ascending: false }).limit(10),
    supabase.from('favorites').select('provider_id, profiles!favorites_provider_id_fkey(id, full_name, avatar_url, city, rating, review_count)').eq('user_id', user.id).order('created_at', { ascending: false }).limit(8),
  ])

  const statusColors: Record<string, string> = {
    cekajici: 'bg-amber-100 text-amber-700',
    prijato: 'bg-blue-100 text-blue-700',
    v_procesu: 'bg-indigo-100 text-indigo-700',
    dokonceno: 'bg-emerald-100 text-emerald-700',
    zruseno: 'bg-red-100 text-red-700',
  }
  const statusLabels: Record<string, string> = {
    cekajici: 'Čeká na přijetí', prijato: 'Přijato', v_procesu: 'V procesu', dokonceno: 'Dokončeno', zruseno: 'Zrušeno',
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Dobrý den, {profile?.full_name?.split(' ')[0]} 👋</h1>
        <p className="mt-0.5 text-sm text-slate-500">{new Intl.DateTimeFormat('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</p>
      </div>

      {/* Upozornění do telefonu — schová se samo, když je prohlížeč nepodporuje */}
      <PushPrompt />

      {/* Stats zákazníka */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100">
            <ShoppingBag className="h-5 w-5 text-indigo-600" />
          </div>
          <p className="text-2xl font-black text-slate-900">{totalOrders ?? 0}</p>
          <p className="mt-0.5 text-xs text-slate-500">Celkem objednávek</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100">
            <TrendingUp className="h-5 w-5 text-amber-600" />
          </div>
          <p className="text-2xl font-black text-slate-900">{activeOrders ?? 0}</p>
          <p className="mt-0.5 text-xs text-slate-500">Aktivní objednávky</p>
        </div>
        <div className="col-span-2 sm:col-span-1 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <p className="mb-2 text-sm font-bold text-emerald-800">Hledáte živnostníka?</p>
          <Link href="/marketplace" className="btn-primary text-sm w-full justify-center">
            <Search className="h-4 w-4" /> Prohlédnout nabídky
          </Link>
        </div>
      </div>

      {/* Moje objednávky */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-bold text-slate-900">Moje objednávky</h2>
        </div>
        {myOrders && myOrders.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {myOrders.map((o: any) => (
              <Link key={o.id} href={`/dashboard/objednavky/${o.id}`} className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-slate-50">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900">{o.services?.title ?? 'Neznámá služba'}</p>
                  <p className="text-sm text-slate-500">
                    {o.profiles?.full_name ?? 'Živnostník'} ·{' '}
                    {o.services?.price ? `${(o.services.price ?? 0).toLocaleString('cs-CZ')} Kč/${o.services.price_unit}` : ''} ·{' '}
                    {new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(o.created_at))}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${statusColors[o.status] ?? 'bg-slate-100 text-slate-500'}`}>
                  {statusLabels[o.status] ?? o.status}
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-slate-300" />
              </Link>
            ))}
          </div>
        ) : (
          <div className="px-5 py-12 text-center">
            <div className="mb-4 text-5xl">🔍</div>
            <p className="mb-2 font-bold text-slate-800">Zatím žádné objednávky</p>
            <p className="mb-5 text-sm text-slate-500">Najděte živnostníka a objednejte svoji první službu.</p>
            <Link href="/marketplace" className="btn-primary inline-flex">
              <Search className="h-4 w-4" /> Najít živnostníka
            </Link>
          </div>
        )}
      </div>

      {/* Oblíbení živnostníci */}
      {favorites && favorites.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
            <Heart className="h-4 w-4 text-rose-500" fill="currentColor" />
            <h2 className="font-bold text-slate-900">Oblíbení živnostníci</h2>
          </div>
          <div className="grid gap-3 p-5 sm:grid-cols-2">
            {favorites.map((f: any) => {
              const p = f.profiles
              if (!p) return null
              return (
                <Link key={f.provider_id} href={`/profil/${p.id}`} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 transition-all hover:border-emerald-200 hover:bg-emerald-50">
                  <Avatar name={p.full_name} url={p.avatar_url} size={44} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-900">{p.full_name ?? 'Živnostník'}</p>
                    <p className="text-xs text-slate-500">
                      {p.city ?? ''}{p.rating ? ` · ${Number(p.rating).toFixed(1)} ★ (${p.review_count ?? 0})` : ''}
                    </p>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* Stát se živnostníkem */}
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-bold text-slate-900">Jste také živnostník?</p>
            <p className="text-sm text-slate-500">Zaregistrujte se jako živnostník a nabízejte své služby tisícům zákazníků.</p>
          </div>
          <Link href="/registrace/zivnostnik" className="btn-secondary shrink-0 text-sm">
            Zaregistrovat se →
          </Link>
        </div>
      </div>
    </div>
  )
}