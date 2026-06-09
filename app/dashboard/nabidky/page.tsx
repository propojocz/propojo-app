// app/dashboard/nabidky/page.tsx
'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { PlusCircle, Eye, EyeOff, Trash2, Loader2, BarChart2 } from 'lucide-react'
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

  const handleDelete = async (id: string) => {
    if (!confirm('Opravdu smazat tuto nabídku?')) return
    setActionId(id)
    await deleteService(id)
    await fetchServices()
    setActionId(null)
  }

  // Celkový počet zobrazení
  const totalViews = services.reduce((sum, s) => sum + (s.view_count ?? 0), 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Moje nabídky</h1>
          <p className="mt-0.5 text-sm text-slate-500">{services.length} nabídek · {totalViews} zobrazení celkem</p>
        </div>
        <Link href="/pridat-sluzbu" className="btn-primary">
          <PlusCircle className="h-4 w-4" /> Přidat nabídku
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
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
            <div key={s.id} className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:shadow-md">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-2xl">
                {CATEGORY_META[s.category as keyof typeof CATEGORY_META]?.emoji ?? '📦'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="truncate font-bold text-slate-900">{s.title}</p>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${s.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {s.is_active ? 'Aktivní' : 'Skrytá'}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  <p className="text-sm text-slate-500">{CATEGORY_META[s.category as keyof typeof CATEGORY_META]?.label} · {s.price.toLocaleString('cs-CZ')} Kč/{s.price_unit} · {s.city}</p>
                  {/* View count */}
                  <span className="flex items-center gap-1 text-xs text-slate-400">
                    <BarChart2 className="h-3.5 w-3.5" />
                    {s.view_count ?? 0} zobrazení
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Link href={`/sluzby/${s.id}`} className="rounded-lg border border-slate-200 p-2 text-slate-500 transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600" title="Zobrazit">
                  <Eye className="h-4 w-4" />
                </Link>
                <button onClick={() => handleToggle(s.id, s.is_active)} disabled={actionId === s.id} className="rounded-lg border border-slate-200 p-2 text-slate-500 transition-colors hover:border-amber-200 hover:bg-amber-50 hover:text-amber-600" title={s.is_active ? 'Skrýt' : 'Aktivovat'}>
                  {actionId === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : s.is_active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
                <button onClick={() => handleDelete(s.id)} disabled={actionId === s.id} className="rounded-lg border border-slate-200 p-2 text-slate-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600" title="Smazat">
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
