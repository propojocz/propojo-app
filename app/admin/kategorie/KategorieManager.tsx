'use client'
// app/admin/kategorie/KategorieManager.tsx
// Strom Kategorie → Podkategorie → Typ služby, s formuláři pro přidání a bezpečným mazáním.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronRight, Plus, Trash2, Loader2, FolderTree, X } from 'lucide-react'
import {
  createCategory, deleteCategory,
  createSubcategory, deleteSubcategory,
  createServiceType, deleteServiceType,
} from '@/lib/actions/categories-admin'

type Category = { id: string; slug: string; name: string; icon: string; color: string; sort_order: number | null }
type Subcategory = { id: string; category_id: string; slug: string; name: string }
type ServiceType = { id: string; subcategory_id: string; name: string }

export default function KategorieManager({
  categories, subcategories, serviceTypes, categoryUsage, subcatUsage,
}: {
  categories: Category[]
  subcategories: Subcategory[]
  serviceTypes: ServiceType[]
  categoryUsage: Record<string, number>
  subcatUsage: Record<string, number>
}) {
  const router = useRouter()
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set())
  const [expandedSubs, setExpandedSubs] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  // Formuláře — otevřené stavy
  const [showAddCat, setShowAddCat] = useState(false)
  const [addSubFor, setAddSubFor] = useState<string | null>(null)
  const [addTypeFor, setAddTypeFor] = useState<string | null>(null)

  const toggleCat = (id: string) => {
    const next = new Set(expandedCats)
    next.has(id) ? next.delete(id) : next.add(id)
    setExpandedCats(next)
  }
  const toggleSub = (id: string) => {
    const next = new Set(expandedSubs)
    next.has(id) ? next.delete(id) : next.add(id)
    setExpandedSubs(next)
  }

  const subsOf = (catId: string) => subcategories.filter((s) => s.category_id === catId)
  const typesOf = (subId: string) => serviceTypes.filter((t) => t.subcategory_id === subId)

  const handleDeleteCategory = async (id: string, name: string) => {
    if (!confirm(`Smazat kategorii „${name}"?`)) return
    setBusy(id); setErr(null)
    const res = await deleteCategory(id)
    if (!res.success) setErr(res.error)
    setBusy(null)
    router.refresh()
  }
  const handleDeleteSubcategory = async (id: string, name: string) => {
    if (!confirm(`Smazat podkategorii „${name}"?`)) return
    setBusy(id); setErr(null)
    const res = await deleteSubcategory(id)
    if (!res.success) setErr(res.error)
    setBusy(null)
    router.refresh()
  }
  const handleDeleteType = async (id: string, name: string) => {
    if (!confirm(`Smazat typ „${name}"?`)) return
    setBusy(id); setErr(null)
    const res = await deleteServiceType(id)
    if (!res.success) setErr(res.error)
    setBusy(null)
    router.refresh()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black text-slate-900">
            <FolderTree className="h-6 w-6 text-emerald-600" /> Kategorie a obory
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Struktura: obor → podkategorie → konkrétní typ služby. Projeví se hned v přidávání služeb i na marketplace.
          </p>
        </div>
        <button
          onClick={() => setShowAddCat((v) => !v)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-600"
        >
          <Plus className="h-4 w-4" /> Nová kategorie
        </button>
      </div>

      {err && (
        <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {err}
          <button onClick={() => setErr(null)}><X className="h-4 w-4" /></button>
        </div>
      )}

      {showAddCat && <AddCategoryForm onDone={() => { setShowAddCat(false); router.refresh() }} onError={setErr} />}

      <div className="space-y-3">
        {categories.length === 0 && (
          <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-400">
            Zatím žádné kategorie. Přidejte první výše.
          </div>
        )}

        {categories.map((cat) => {
          const subs = subsOf(cat.id)
          const isOpen = expandedCats.has(cat.id)
          const usage = categoryUsage[cat.slug] ?? 0
          return (
            <div key={cat.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              {/* Řádek kategorie */}
              <div className="flex items-center gap-3 p-4">
                <button onClick={() => toggleCat(cat.id)} className="text-slate-400 hover:text-slate-600">
                  {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
                <span className="text-xl">{cat.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-slate-900">{cat.name}</p>
                    <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ backgroundColor: `${cat.color}18`, color: cat.color }}>
                      {cat.slug}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    {subs.length} {subs.length === 1 ? 'podkategorie' : subs.length < 5 ? 'podkategorie' : 'podkategorií'} · {usage} {usage === 1 ? 'služba' : usage < 5 ? 'služby' : 'služeb'}
                  </p>
                </div>
                <button
                  onClick={() => setAddSubFor(addSubFor === cat.id ? null : cat.id)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
                >
                  <Plus className="h-3.5 w-3.5" /> Podkategorie
                </button>
                <button
                  onClick={() => handleDeleteCategory(cat.id, cat.name)}
                  disabled={busy === cat.id || usage > 0}
                  title={usage > 0 ? `Používá ji ${usage} služeb` : 'Smazat kategorii'}
                  className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  {busy === cat.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </button>
              </div>

              {/* Formulář nové podkategorie */}
              {addSubFor === cat.id && (
                <div className="border-t border-slate-100 bg-slate-50 p-4">
                  <AddSubcategoryForm categoryId={cat.id} onDone={() => { setAddSubFor(null); router.refresh() }} onError={setErr} />
                </div>
              )}

              {/* Podkategorie */}
              {isOpen && subs.length > 0 && (
                <div className="border-t border-slate-100 divide-y divide-slate-100">
                  {subs.map((sub) => {
                    const types = typesOf(sub.id)
                    const subOpen = expandedSubs.has(sub.id)
                    const subUsage = subcatUsage[sub.id] ?? 0
                    return (
                      <div key={sub.id} className="bg-slate-50/50">
                        <div className="flex items-center gap-3 py-3 pl-12 pr-4">
                          <button onClick={() => toggleSub(sub.id)} className="text-slate-400 hover:text-slate-600">
                            {subOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          </button>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-slate-800">{sub.name}</p>
                            <p className="text-xs text-slate-400">
                              {types.length > 0 && `${types.length} typů · `}{subUsage} {subUsage === 1 ? 'služba' : subUsage < 5 ? 'služby' : 'služeb'}
                            </p>
                          </div>
                          <button
                            onClick={() => setAddTypeFor(addTypeFor === sub.id ? null : sub.id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
                          >
                            <Plus className="h-3 w-3" /> Typ
                          </button>
                          <button
                            onClick={() => handleDeleteSubcategory(sub.id, sub.name)}
                            disabled={busy === sub.id || subUsage > 0}
                            title={subUsage > 0 ? `Používá ji ${subUsage} služeb` : 'Smazat podkategorii'}
                            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
                          >
                            {busy === sub.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                          </button>
                        </div>

                        {addTypeFor === sub.id && (
                          <div className="bg-white px-4 py-3 pl-12">
                            <AddServiceTypeForm subcategoryId={sub.id} onDone={() => { setAddTypeFor(null); router.refresh() }} onError={setErr} />
                          </div>
                        )}

                        {subOpen && types.length > 0 && (
                          <div className="space-y-1.5 bg-white px-4 py-3 pl-16">
                            {types.map((t) => (
                              <div key={t.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-1.5">
                                <span className="text-xs text-slate-600">{t.name}</span>
                                <button
                                  onClick={() => handleDeleteType(t.id, t.name)}
                                  disabled={busy === t.id}
                                  className="text-slate-300 transition-colors hover:text-red-500"
                                >
                                  {busy === t.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Formulář: nová kategorie ──
function AddCategoryForm({ onDone, onError }: { onDone: () => void; onError: (e: string) => void }) {
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('🔧')
  const [color, setColor] = useState('#10b981')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    setSaving(true)
    const res = await createCategory({ name, icon, color })
    if (!res.success) { onError(res.error); setSaving(false); return }
    onDone()
  }

  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_90px_90px_auto]">
        <input
          value={name} onChange={(e) => setName(e.target.value)}
          placeholder="Název kategorie (např. Kutilství)"
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
          autoFocus
        />
        <input
          value={icon} onChange={(e) => setIcon(e.target.value)}
          placeholder="🔧"
          title="Emoji ikonka (Windows: Win + tečka)"
          className="rounded-xl border border-slate-200 px-3 py-2 text-center text-lg outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
        />
        <input
          type="color" value={color} onChange={(e) => setColor(e.target.value)}
          className="h-full w-full cursor-pointer rounded-xl border border-slate-200"
        />
        <button
          onClick={submit} disabled={saving || name.trim().length < 2}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-600 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Přidat
        </button>
      </div>
      <p className="mt-2 text-xs text-slate-400">Emoji vložíte klávesou Win + tečka (Windows) nebo Cmd + Ctrl + Mezerník (Mac).</p>
    </div>
  )
}

// ── Formulář: nová podkategorie ──
function AddSubcategoryForm({ categoryId, onDone, onError }: { categoryId: string; onDone: () => void; onError: (e: string) => void }) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    setSaving(true)
    const res = await createSubcategory({ category_id: categoryId, name })
    if (!res.success) { onError(res.error); setSaving(false); return }
    onDone()
  }

  return (
    <div className="flex gap-2">
      <input
        value={name} onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="Název podkategorie (např. Montáž nábytku)"
        className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
        autoFocus
      />
      <button
        onClick={submit} disabled={saving || name.trim().length < 2}
        className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-600 disabled:opacity-50"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Přidat
      </button>
    </div>
  )
}

// ── Formulář: nový typ služby ──
function AddServiceTypeForm({ subcategoryId, onDone, onError }: { subcategoryId: string; onDone: () => void; onError: (e: string) => void }) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    setSaving(true)
    const res = await createServiceType({ subcategory_id: subcategoryId, name })
    if (!res.success) { onError(res.error); setSaving(false); return }
    onDone()
  }

  return (
    <div className="flex gap-2">
      <input
        value={name} onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="Název typu (např. Sestavení skříně)"
        className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
        autoFocus
      />
      <button
        onClick={submit} disabled={saving || name.trim().length < 2}
        className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-600 disabled:opacity-50"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Přidat
      </button>
    </div>
  )
}