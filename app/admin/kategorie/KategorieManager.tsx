'use client'
// app/admin/kategorie/KategorieManager.tsx
// Strom Kategorie → Podkategorie → Typ služby, s formuláři pro přidání a bezpečným mazáním.
//
// Navíc: podkategorie navržené poskytovateli („Nevidím svou službu") čekají
// na schválení. Dokud je neschválíte, fungují jim na kartě, ale zákazníkům
// se ve vyhledávání neukážou. Nahoře je proto pruh „Čeká na schválení".
//
// Ikony kategorií se NEBEROU z DB (`categories.icon` = emoji), ale z kódu
// podle slugu — viz lib/categoryIcons.tsx.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronDown, ChevronRight, Plus, Trash2, Loader2, FolderTree, X, Check, Clock, Sparkles, Pencil, FolderInput, Combine,
} from 'lucide-react'
import { CategoryIcon } from '@/lib/categoryIcons'
import {
  createCategory, deleteCategory,
  createSubcategory, deleteSubcategory,
  createServiceType, deleteServiceType,
} from '@/lib/actions/categories-admin'
import { approveSubcategory, unapproveSubcategory, renameSubcategory, moveSubcategory, mergeSubcategories } from '@/lib/actions/subcategories'

type Category = { id: string; slug: string; name: string; icon: string; color: string; sort_order: number | null }
type Subcategory = {
  id: string; category_id: string; slug: string; name: string
  is_approved?: boolean; created_by?: string | null; suggested_note?: string | null
}
type ServiceType = { id: string; subcategory_id: string; name: string }

export default function KategorieManager({
  categories, subcategories, serviceTypes, categoryUsage, subcatUsage, authorNames = {},
}: {
  categories: Category[]
  subcategories: Subcategory[]
  serviceTypes: ServiceType[]
  categoryUsage: Record<string, number>
  subcatUsage: Record<string, number>
  /** id poskytovatele → jeho jméno, u navržených podkategorií */
  authorNames?: Record<string, string>
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

  // Podkategorie navržené poskytovateli — čekají, až je zařadíte.
  const pending = subcategories.filter((s) => s.is_approved === false)
  const catOf = (catId: string) => categories.find((c) => c.id === catId)

  const handleApprove = async (id: string) => {
    setBusy(id); setErr(null)
    const res = await approveSubcategory(id)
    if (!res.success) setErr(res.error)
    setBusy(null)
    router.refresh()
  }

  const handleUnapprove = async (id: string) => {
    setBusy(id); setErr(null)
    const res = await unapproveSubcategory(id)
    if (!res.success) setErr(res.error)
    setBusy(null)
    router.refresh()
  }

  // Přejmenování podkategorie — hlavně při schvalování návrhů od poskytovatelů,
  // kde bývají překlepy nebo neodborný název.
  const handleRename = async (id: string, current: string) => {
    const next = prompt('Nový název podkategorie:', current)
    if (next == null) return
    const clean = next.trim()
    if (clean.length < 3 || clean === current) return
    setBusy(id); setErr(null)
    const res = await renameSubcategory(id, clean)
    if (!res.success) setErr(res.error)
    setBusy(null)
    router.refresh()
  }

  // Přesun podkategorie pod jinou kategorii (špatně zařazená od poskytovatele).
  // Karty, ceník i objednávky zůstanou — visí na subcategory_id, ne na kategorii.
  const handleMove = async (id: string, currentCatId: string, name: string) => {
    const jine = categories.filter(c => c.id !== currentCatId)
    if (jine.length === 0) return
    const seznam = jine.map((c, i) => `${i + 1}) ${c.name}`).join('\n')
    const vstup = prompt(`Přesunout „${name}" pod kterou kategorii?\n\n${seznam}\n\nNapište číslo:`)
    if (vstup == null) return
    const idx = parseInt(vstup.trim(), 10) - 1
    if (isNaN(idx) || idx < 0 || idx >= jine.length) { setErr('Neplatné číslo kategorie.'); return }
    setBusy(id); setErr(null)
    const res = await moveSubcategory(id, jine[idx].id)
    if (!res.success) setErr(res.error)
    setBusy(null)
    router.refresh()
  }

  // Sloučit tuhle podkategorii DO jiné (odstranění duplicit po sloučení kategorií).
  // Nabídneme ostatní podkategorie ze STEJNÉ kategorie — tam duplicity vznikají.
  const handleMerge = async (id: string, catId: string, name: string) => {
    const sourozenci = subcategories.filter(x => x.category_id === catId && x.id !== id)
    if (sourozenci.length === 0) { setErr('V téhle kategorii není do čeho sloučit.'); return }
    const seznam = sourozenci.map((x, i) => `${i + 1}) ${x.name}`).join('\n')
    const vstup = prompt(`Sloučit „${name}" DO které podkategorie?\nKarty i ceník se přesunou, „${name}" pak zmizí.\n\n${seznam}\n\nNapište číslo:`)
    if (vstup == null) return
    const idx = parseInt(vstup.trim(), 10) - 1
    if (isNaN(idx) || idx < 0 || idx >= sourozenci.length) { setErr('Neplatné číslo.'); return }
    if (!confirm(`Opravdu sloučit „${name}" do „${sourozenci[idx].name}"? Nevratné.`)) return
    setBusy(id); setErr(null)
    const res = await mergeSubcategories(id, sourozenci[idx].id)
    if (!res.success) setErr(res.error)
    setBusy(null)
    router.refresh()
  }

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

      {/* ── ČEKÁ NA SCHVÁLENÍ ──────────────────────────────────────
          Podkategorie, které si vypsali poskytovatelé. Na kartě jim
          fungují hned; ve vyhledávání se ukážou až po schválení. */}
      {pending.length > 0 && (
        <div className="rounded-2xl border-2 border-amber-300 bg-amber-50/70 p-4">
          <h2 className="flex items-center gap-2 text-sm font-black text-amber-900">
            <Clock className="h-4 w-4" />
            Čeká na schválení ({pending.length})
          </h2>
          <p className="mt-0.5 text-xs leading-relaxed text-amber-800">
            Tyhle služby si vypsali poskytovatelé sami. Na svých kartách je mají a mohou přijímat
            objednávky — zákazníkům se ale ve vyhledávání ukážou, až je schválíte.
            Než schválíte, projděte název: má znít odborně a sedět ke zbytku katalogu.
          </p>

          <ul className="mt-3 space-y-2">
            {pending.map((sub) => {
              const cat = catOf(sub.category_id)
              const author = sub.created_by ? authorNames[sub.created_by] : null
              return (
                <li key={sub.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-white px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
                      <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                      {sub.name}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs text-slate-500">
                      {cat ? (
                        <span className="inline-flex items-center gap-1">
                          <CategoryIcon slug={cat.slug} className="h-3.5 w-3.5 text-emerald-600" />
                          {cat.name}
                        </span>
                      ) : 'bez kategorie'}
                      {author && <span>· navrhl {author}</span>}
                      <span>· {subcatUsage[sub.id] ?? 0} {(subcatUsage[sub.id] ?? 0) === 1 ? 'karta' : 'karet'}</span>
                    </p>
                    {sub.suggested_note && (
                      <p className="mt-1 text-xs italic text-slate-400">„{sub.suggested_note}"</p>
                    )}
                  </div>

                  <button
                    onClick={() => handleApprove(sub.id)}
                    disabled={busy === sub.id}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-600 disabled:opacity-50"
                  >
                    {busy === sub.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    Schválit
                  </button>
                  <button
                    onClick={() => handleRename(sub.id, sub.name)}
                    disabled={busy === sub.id}
                    title="Upravit název — třeba opravit překlep, než schválíte"
                    className="rounded-lg border border-slate-200 p-1.5 text-slate-400 transition hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-40"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleMove(sub.id, sub.category_id, sub.name)}
                    disabled={busy === sub.id}
                    title="Přesunout pod jinou kategorii"
                    className="rounded-lg border border-slate-200 p-1.5 text-slate-400 transition hover:bg-blue-50 hover:text-blue-600 disabled:opacity-40"
                  >
                    <FolderInput className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteSubcategory(sub.id, sub.name)}
                    disabled={busy === sub.id || (subcatUsage[sub.id] ?? 0) > 0}
                    title={(subcatUsage[sub.id] ?? 0) > 0 ? 'Používá ji karta poskytovatele — nejde smazat (můžete přejmenovat)' : 'Zamítnout a smazat'}
                    className="rounded-lg border border-slate-200 p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              )
            })}
          </ul>
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
          const catPending = subs.filter((s) => s.is_approved === false).length
          return (
            <div key={cat.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              {/* Řádek kategorie */}
              <div className="flex items-center gap-3 p-4">
                <button onClick={() => toggleCat(cat.id)} className="text-slate-400 hover:text-slate-600">
                  {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
                <CategoryIcon slug={cat.slug} boxed className="h-4 w-4" boxClassName="h-9 w-9 rounded-xl" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-slate-900">{cat.name}</p>
                    <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ backgroundColor: `${cat.color}18`, color: cat.color }}>
                      {cat.slug}
                    </span>
                    {catPending > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                        <Clock className="h-3 w-3" /> {catPending} čeká
                      </span>
                    )}
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
                    const waiting = sub.is_approved === false
                    return (
                      <div key={sub.id} className={waiting ? 'bg-amber-50/40' : 'bg-slate-50/50'}>
                        <div className="flex items-center gap-3 py-3 pl-12 pr-4">
                          <button onClick={() => toggleSub(sub.id)} className="text-slate-400 hover:text-slate-600">
                            {subOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          </button>
                          <div className="min-w-0 flex-1">
                            <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                              {sub.name}
                              {waiting && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                                  <Clock className="h-2.5 w-2.5" /> čeká na schválení
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-slate-400">
                              {types.length > 0 && `${types.length} typů · `}{subUsage} {subUsage === 1 ? 'služba' : subUsage < 5 ? 'služby' : 'služeb'}
                            </p>
                          </div>

                          {waiting ? (
                            <button
                              onClick={() => handleApprove(sub.id)}
                              disabled={busy === sub.id}
                              title="Schválit — ukáže se zákazníkům ve vyhledávání"
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-2.5 py-1 text-[11px] font-bold text-white transition hover:bg-emerald-600 disabled:opacity-50"
                            >
                              {busy === sub.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Schválit
                            </button>
                          ) : (
                            <button
                              onClick={() => handleUnapprove(sub.id)}
                              disabled={busy === sub.id}
                              title="Skrýt ze zákaznického vyhledávání"
                              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-500 transition hover:border-amber-300 hover:text-amber-700 disabled:opacity-40"
                            >
                              Skrýt
                            </button>
                          )}

                          <button
                            onClick={() => setAddTypeFor(addTypeFor === sub.id ? null : sub.id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
                          >
                            <Plus className="h-3 w-3" /> Typ
                          </button>
                          <button
                            onClick={() => handleRename(sub.id, sub.name)}
                            disabled={busy === sub.id}
                            title="Upravit název podkategorie"
                            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-40"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleMove(sub.id, sub.category_id, sub.name)}
                            disabled={busy === sub.id}
                            title="Přesunout pod jinou kategorii"
                            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600 disabled:opacity-40"
                          >
                            <FolderInput className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleMerge(sub.id, sub.category_id, sub.name)}
                            disabled={busy === sub.id}
                            title="Sloučit do jiné podkategorie (odstranit duplicitu)"
                            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-purple-50 hover:text-purple-600 disabled:opacity-40"
                          >
                            <Combine className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteSubcategory(sub.id, sub.name)}
                            disabled={busy === sub.id || subUsage > 0}
                            title={subUsage > 0 ? `Používá ji ${subUsage} služeb — nejde smazat (můžete přejmenovat)` : 'Smazat podkategorii'}
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
          title="Emoji se ukládá do DB kvůli zpětné kompatibilitě, ale v rozhraní se nezobrazuje"
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
      <p className="mt-2 text-xs leading-relaxed text-slate-400">
        Emoji se zapíše do databáze, ale v rozhraní se nepoužívá — ikona kategorie se určuje
        podle slugu v <code className="rounded bg-slate-100 px-1">lib/categoryIcons.tsx</code>.
        Po založení nové kategorie tam doplňte řádek, jinak se ukáže náhradní ikona.
      </p>
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