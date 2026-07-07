// app/dashboard/nabidky/page.tsx
'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { PlusCircle, Eye, EyeOff, Trash2, Loader2, BarChart2, Pencil, CalendarPlus } from 'lucide-react'
import { toggleServiceActive, deleteService } from '@/lib/actions/services'
import { CATEGORY_META } from '@/types/database'

export default function NabidkyPage() {
  const [services, setServices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [actionId, setActionId] = useState<string | null>(null)

  const fetchServices = async () => {
    setLoading(true)
    const res = await fetch('/api/my-services')
    const data = await res.json()
    setServices(data.services ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchServices() }, [])

  const handleToggle = async (id: string, current: boolean) => {
    setActionId(id)
    await toggleServiceActive(id, !current)
    await fetchServices()
    setActionId(null)
  }

  const handleDelete = async (id: string, isActive: boolean) => {
    if (!confirm('Opravdu smazat tuto nabídku?')) return
    setActionId(id)
    const res: any = await deleteService(id)
    if (!res.success) {
      // Nabídka má objednávky → nelze smazat, ale nabídneme skrytí
      if (res.hasOrders) {
        const skryt = confirm(`${res.error}\n\nChcete ji teď skrýt?`)
        if (skryt && isActive) {
          await toggleServiceActive(id, false)
        }
      } else {
        alert(res.error)
      }
    }
    await fetchServices()
    setActionId(null)
  }

  // Celkový počet zobrazení
  const totalViews = services.reduce((sum, s) => sum + (s.view_count ?? 0), 0)

  // Cenový text – ošetří Model B (nacenění) i null cenu
  const priceText = (s: any) => {
    if (s.payment_model === 'B') return 'Nacenění na místě'
    if ((s.price ?? 0) > 0) return `${Number(s.price).toLocaleString('cs-CZ')} Kč/${s.price_unit}`
    return 'Cena dohodou'
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Moje nabídky</h1>
          <p className="mt-0.5 text-sm text-slate-500">{services.length} nabídek · {totalViews} zobrazení celkem</p>
        </div>
        <Link href="/pridat-sluzbu" className="btn-primary self-start sm:self-auto">
          <PlusCircle className="h-4 w-4" /> Přidat nabídku
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
        </div>
      ) : services.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white p-12 text-center">
          <div className="mb-4 text-5xl">📦</div>
          <h3 className="mb-2 text-lg font-bold text-slate-800">Zatím žádné nabídky</h3>
          <p className="mb-5 text-sm text-slate-500">Přidejte svoji první nabídku a začněte přijímat objednávky.</p>
          <Link href="/pridat-sluzbu" className="btn-primary">
            <PlusCircle className="h-4 w-4" /> Přidat první nabídku
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {services.map((s: any) => (
            <div key={s.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:shadow-md sm:flex-row sm:items-center sm:gap-4">
              <div className="flex items-center gap-4">
                <Link href={`/sluzby/${s.id}`} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-2xl">
                  {CATEGORY_META[s.category as keyof typeof CATEGORY_META]?.emoji ?? '📦'}
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link href={`/sluzby/${s.id}`} className="truncate font-bold text-slate-900 hover:text-emerald-700">{s.title}</Link>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${s.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {s.is_active ? 'Aktivní' : 'Skrytá'}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                    <p className="text-sm text-slate-500">{CATEGORY_META[s.category as keyof typeof CATEGORY_META]?.label ?? s.category} · {priceText(s)} · {s.city}</p>
                    <span className="flex items-center gap-1 text-xs text-slate-400">
                      <BarChart2 className="h-3.5 w-3.5" />
                      {s.view_count ?? 0} zobrazení
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                <Link href={`/dashboard/nabidky/${s.id}/upravit`} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition-colors hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700">
                  <Pencil className="h-4 w-4" /> Upravit
                </Link>
                {s.payment_model === 'A' && (
                  <Link href={`/dashboard/terminy?service=${s.id}`} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition-colors hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700">
                    <CalendarPlus className="h-4 w-4" /> Přidat termín
                  </Link>
                )}
                <button onClick={() => handleToggle(s.id, s.is_active)} disabled={actionId === s.id} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition-colors hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700 disabled:opacity-50">
                  {actionId === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : s.is_active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  {s.is_active ? 'Skrýt' : 'Zveřejnit'}
                </button>
                <button onClick={() => handleDelete(s.id, s.is_active)} disabled={actionId === s.id} className="rounded-lg border border-slate-200 p-2 text-slate-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-50" title="Smazat nabídku">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}