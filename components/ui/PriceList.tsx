'use client'
// components/ui/PriceList.tsx
// Ceník úkonů jedné karty — SESKUPENÝ PODLE PODKATEGORIÍ vybraných na kartě.
//
// Myšlenka (vrstva 13): co si poskytovatel naklikal nahoře v kategoriích,
// to ho tady čeká jako připravené skupiny. U každé buď doplní cenu prvního
// úkonu, nebo si k ní přidá víc úkonů (kadeřník: Střihání → pánský, dámský,
// dětský). Žádný druhý výběr kategorie — ten byl matoucí a je pryč.
//
// Karta musí existovat (mít serviceId), teprve pak sem chodí úkony.

import { useState, type MouseEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Plus, Pencil, Trash2, Eye, EyeOff, ArrowUp, ArrowDown, Loader2, AlertTriangle, Tag, Sparkles,
} from 'lucide-react'
import type { ServiceItem } from '@/types/database'
import { formatItemPrice, packageLabel } from '@/lib/price-format'
import {
  createServiceItem, updateServiceItem, deleteServiceItem,
  toggleServiceItemActive, reorderServiceItems, countItemOrders,
} from '@/lib/actions/service-items'
import ServiceItemEditor, {
  type ServiceItemValues, type ServiceTypeOption,
} from '@/components/ui/ServiceItemEditor'

/** Podkategorie vybraná na kartě — základ jedné skupiny v ceníku. */
export interface PriceListSubcategory {
  id: string
  name: string
  /** Vlastní, zatím neschválená podkategorie poskytovatele. */
  isOwn?: boolean
}

interface Props {
  serviceId: string | null
  items: ServiceItem[]
  serviceTypes: ServiceTypeOption[]
  /** Podkategorie vybrané na kartě — podle nich se ceník předvyplní. */
  subcategories?: PriceListSubcategory[]
  /** Zavolá se po každé změně ceníku, ať si rodič načte aktuální položky. */
  onChanged?: () => void
}

// Řádek → hodnoty pro editor.
function itemToValues(it: ServiceItem): ServiceItemValues {
  return {
    id: it.id,
    service_type_id: it.service_type_id,
    subcategory_id: (it as any).subcategory_id ?? null,
    name: it.name,
    payment_model: (it.payment_model as 'A' | 'B') ?? 'A',
    price_type: (it.price_type as ServiceItemValues['price_type']) ?? 'fixed',
    price: it.price,
    price_unit: (it.price_unit as ServiceItemValues['price_unit']) ?? 'ukon',
    price_max: it.price_max,
    duration_minutes: it.duration_minutes,
    hourly_started_billing: (it as any).hourly_started_billing === true,
    deposit_amount: it.deposit_amount,
    deposit_type: ((it as any).deposit_type as 'zaloha' | 'plna_platba' | 'bez_platby') ?? 'zaloha',
    no_show_fee: (it as any).no_show_fee ?? null,
    fee_mode: ((it as any).fee_mode as 'noshow' | 'storno' | 'zadny') ?? 'noshow',
    price_includes_material: it.price_includes_material ?? null,
    price_note: it.price_note,
    is_active: it.is_active,
    quote_fee: (it as any).quote_fee ?? null,
    price_per_km: (it as any).price_per_km ?? null,
    free_km: (it as any).free_km ?? null,
    quote_days: (it as any).quote_days ?? null,

    // Fotka položky — sdílené pole (služba i výrobek), bez tohohle by se při
    // editaci existující položky ztratila.
    image_url: (it as any).image_url ?? null,
    price_unit_quantity: Number((it as any).price_unit_quantity ?? 1),
    package_quantity: (it as any).package_quantity ?? null,
    package_unit: (it as any).package_unit ?? null,

    // Výrobková pole — u starších řádků bezpečně spadnou na službu / null.
    item_type: ((it as any).item_type as 'service' | 'product') ?? 'service',
    pickup_mode: ((it as any).pickup_mode as 'pickup' | 'delivery' | 'both' | null) ?? null,
    min_quantity_per_order: (it as any).min_quantity_per_order ?? null,
    stock_mode: ((it as any).stock_mode as 'stock' | 'made_to_order' | 'unlimited' | null) ?? null,
    stock_quantity: (it as any).stock_quantity ?? null,
    max_quantity_per_order: (it as any).max_quantity_per_order ?? null,
    production_capacity: (it as any).production_capacity ?? null,
    lead_time_days: (it as any).lead_time_days ?? null,
    available_days: (it as any).available_days ?? null,
  }
}

// Souhrnný řádek ceny pod názvem úkonu.
function itemSummary(it: ServiceItem): string {
  const parts: string[] = []

  parts.push(formatItemPrice(it as any))
  const balení = packageLabel((it as any).package_quantity, (it as any).package_unit)
  if (balení) parts.push(`balení ${balení}`)

  if (it.duration_minutes) parts.push(`${it.duration_minutes} min`)
  const dep = (it as any).deposit_type as string | undefined
  if (it.payment_model !== 'B' && dep === 'zaloha' && it.deposit_amount) {
    parts.push(`záloha ${it.deposit_amount.toLocaleString('cs-CZ')} Kč`)
  }
  if (it.payment_model !== 'B' && dep === 'plna_platba') parts.push('platba předem')
  if (dep === 'bez_platby') parts.push('platba až po službě')
  return parts.join(' · ')
}

type EditorState =
  | { kind: 'closed' }
  | { kind: 'new'; subcategoryId: string | null; subcategoryName: string | null; prefillName: string }
  | { kind: 'edit'; item: ServiceItem }

type Busy = { id: string; action: 'toggle' | 'delete' | 'move' } | null

export default function PriceList({
  serviceId, items, serviceTypes, subcategories = [], onChanged,
}: Props) {
  const [editor, setEditor] = useState<EditorState>({ kind: 'closed' })
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState<Busy>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<{ item: ServiceItem; orders: number } | null>(null)

  // ── Výchozí záloha pro NOVÉ úkony ─────────────────────────────
  // Barber nastavuje u každého úkonu tu samou částku dokola. Tady si ji řekne
  // jednou a každý nový úkon ji dostane předvyplněnou; v editoru se dá přepsat
  // nebo úplně vypnout. Existující úkony se NEPŘEPISUJÍ — ruční nastavení má
  // vždycky přednost.
  //
  // Nedrží se v databázi: odvodí se z toho, co už v ceníku je (nejčastější
  // částka), takže po znovunačtení stránky sedí dál a nepotřebuje migraci.
  const odvozenaZaloha = (): number => {
    const castky = items
      .filter((i) => (i as any).deposit_type !== 'bez_platby')
      .map((i) => Number(i.deposit_amount ?? 0))
      .filter((c) => c > 0)
    if (castky.length === 0) return 200
    const cetnost = new Map<number, number>()
    for (const c of castky) cetnost.set(c, (cetnost.get(c) ?? 0) + 1)
    return [...cetnost.entries()].sort((a, b) => b[1] - a[1])[0][0]
  }
  const [vychoziZaloha, setVychoziZaloha] = useState<number>(odvozenaZaloha)
  const [upravaZalohy, setUpravaZalohy] = useState(false)

  const sorted = [...items].sort((a, b) => a.sort_order - b.sort_order)
  const itemsOf = (subId: string) => sorted.filter((i) => (i as any).subcategory_id === subId)
  // Úkony z dřívějška, které ještě nemají přiřazenou podkategorii.
  const orphans = sorted.filter((i) => !(i as any).subcategory_id)

  // ── Uložení z editoru (nová i úprava) ──
  const handleSave = async (v: ServiceItemValues) => {
    if (!serviceId) return
    setSaving(true); setError(null)
    const payload = { ...v, service_id: serviceId }
    const res = editor.kind === 'edit' && v.id
      ? await updateServiceItem(v.id, payload)
      : await createServiceItem(payload)
    setSaving(false)
    if (res.success) {
      setEditor({ kind: 'closed' })
      onChanged?.()
    } else {
      setError(res.error)
    }
  }

  const handleToggle = async (it: ServiceItem) => {
    setBusy({ id: it.id, action: 'toggle' }); setError(null)
    const res = await toggleServiceItemActive(it.id, !it.is_active)
    setBusy(null)
    if (res.success) onChanged?.()
    else setError(res.error)
  }

  const askDelete = async (it: ServiceItem) => {
    setBusy({ id: it.id, action: 'delete' }); setError(null)
    const orders = await countItemOrders(it.id)
    setBusy(null)
    setConfirmDelete({ item: it, orders })
  }

  const doDelete = async () => {
    if (!confirmDelete) return
    const it = confirmDelete.item
    setBusy({ id: it.id, action: 'delete' }); setError(null)
    const res = await deleteServiceItem(it.id)
    setBusy(null); setConfirmDelete(null)
    if (res.success) onChanged?.()
    else setError(res.error)
  }

  // Přesun v rámci CELÉHO ceníku (sort_order je globální).
  const move = async (it: ServiceItem, dir: -1 | 1) => {
    if (!serviceId) return
    const index = sorted.findIndex((x) => x.id === it.id)
    const target = index + dir
    if (target < 0 || target >= sorted.length) return
    const reordered = [...sorted]
    ;[reordered[index], reordered[target]] = [reordered[target], reordered[index]]
    setBusy({ id: it.id, action: 'move' }); setError(null)
    const res = await reorderServiceItems(serviceId, reordered.map((r) => r.id))
    setBusy(null)
    if (res.success) onChanged?.()
    else setError(res.error)
  }

  // ── Karta ještě není uložená ──
  if (!serviceId) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center">
        <p className="text-sm font-semibold text-slate-600">Nejdřív uložte kartu</p>
        <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-slate-400">
          Jakmile kartu uložíte, otevře se tu ceník podle podkategorií, které jste vybrali výše.
        </p>
      </div>
    )
  }

  // ── Žádné podkategorie na kartě ──
  if (subcategories.length === 0 && sorted.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-amber-200 bg-amber-50/60 px-5 py-8 text-center">
        <p className="text-sm font-semibold text-slate-700">Vyberte nejdřív podkategorie</p>
        <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-slate-500">
          Nahoře u kategorie zaškrtněte, co děláte. Podle toho vám sem připravíme řádky,
          kterým už jen doplníte cenu.
        </p>
      </div>
    )
  }

  // Jeden řádek úkonu.
  const renderItem = (it: ServiceItem) => {
    const isBusy = busy?.id === it.id
    const modelBadge = it.payment_model === 'B'
      ? { text: 'nacenění', cls: 'bg-blue-50 text-blue-700' }
      : { text: 'pevná cena', cls: 'bg-emerald-50 text-emerald-700' }
    return (
      <li key={it.id} className={`flex items-center gap-3 px-3 py-3 sm:px-4 ${!it.is_active ? 'opacity-55' : ''}`}>
        <div className="flex flex-none flex-col">
          <button
            type="button" onClick={() => move(it, -1)} disabled={isBusy}
            className="rounded p-0.5 text-slate-300 hover:text-slate-600 disabled:opacity-30"
            aria-label="Posunout nahoru"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button" onClick={() => move(it, 1)} disabled={isBusy}
            className="rounded p-0.5 text-slate-300 hover:text-slate-600 disabled:opacity-30"
            aria-label="Posunout dolů"
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
        </div>

        {(it as any).image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={(it as any).image_url}
            alt=""
            className="h-10 w-10 shrink-0 rounded-lg border border-slate-200 object-cover"
          />
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">{it.name}</p>
          <p className="mt-0.5 truncate text-xs text-slate-500">{itemSummary(it)}</p>
        </div>

        <span className={`hidden flex-none rounded-md px-2 py-0.5 text-[11px] font-bold sm:inline ${it.is_active ? modelBadge.cls : 'bg-slate-100 text-slate-500'}`}>
          {it.is_active ? modelBadge.text : 'Skryto'}
        </span>

        <div className="flex flex-none items-center gap-1">
          <button
            type="button" onClick={() => handleToggle(it)} disabled={isBusy}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40"
            title={it.is_active ? 'Skrýt z ceníku — zákazník ho neuvidí' : 'Zveřejnit zákazníkům'}
          >
            {busy?.id === it.id && busy.action === 'toggle'
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : it.is_active ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </button>
          <button
            type="button" onClick={() => setEditor({ kind: 'edit', item: it })} disabled={isBusy}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-40"
            title="Upravit úkon"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button" onClick={() => askDelete(it)} disabled={isBusy}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
            title="Smazat úkon"
          >
            {busy?.id === it.id && busy.action === 'delete'
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Trash2 className="h-4 w-4" />}
          </button>
        </div>
      </li>
    )
  }

  const editorOpenFor = (subId: string | null) =>
    editor.kind === 'new' && editor.subcategoryId === subId

  // Které vybrané služby nemají ani jeden úkon → nejde z nich objednat.
  const prazdneSkupiny = subcategories.filter(sub => itemsOf(sub.id).length === 0)

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {/* ── VÝCHOZÍ ZÁLOHA ──
          Jedno rozhodnutí místo desetkrát to samé. Platí jen pro NOVĚ přidané
          úkony; co je hotové, zůstává, jak si to poskytovatel nastavil. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-slate-200 bg-white px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold text-slate-800">Rezervační záloha od zákazníka</p>
          <p className="text-[11.5px] leading-relaxed text-slate-500">
            Předvyplní se u každého nového úkonu. U konkrétní služby ji pak můžete změnit nebo vypnout.
          </p>
        </div>

        {upravaZalohy ? (
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={200}
              step={50}
              autoFocus
              value={vychoziZaloha}
              onChange={(e) => setVychoziZaloha(Math.max(0, Number(e.target.value) || 0))}
              onKeyDown={(e) => { if (e.key === 'Enter') setUpravaZalohy(false) }}
              className="w-28 rounded-xl border-[1.5px] border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-emerald-500"
            />
            <button
              type="button"
              onClick={() => setUpravaZalohy(false)}
              className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-600"
            >
              Hotovo
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2.5">
            <span className="text-[15px] font-extrabold text-slate-900">
              {vychoziZaloha.toLocaleString('cs-CZ')} Kč
            </span>
            <button
              type="button"
              onClick={() => setUpravaZalohy(true)}
              className="text-xs font-bold text-emerald-600 underline hover:text-emerald-700"
            >
              Změnit
            </button>
          </div>
        )}
      </div>

      {/* ── SKUPINY PODLE PODKATEGORIÍ ── */}
      {subcategories.map((sub) => {
        const groupItems = itemsOf(sub.id)
        const empty = groupItems.length === 0
        return (
          <div key={sub.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {/* Hlavička skupiny */}
            <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-2.5">
              <Tag className="h-4 w-4 shrink-0 text-emerald-600" />
              <p className="min-w-0 flex-1 truncate text-sm font-bold text-slate-800">{sub.name}</p>
              {sub.isOwn && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                  <Sparkles className="h-2.5 w-2.5" /> vaše vlastní
                </span>
              )}
              {empty ? (
                <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                  nejde objednat
                </span>
              ) : (
                <span className="shrink-0 text-xs text-slate-400">
                  {groupItems.length} {groupItems.length === 1 ? 'úkon' : groupItems.length < 5 ? 'úkony' : 'úkonů'}
                </span>
              )}
            </div>

            {/* Úkony ve skupině */}
            {!empty && (
              <ul className="divide-y divide-slate-100">
                {groupItems.map(renderItem)}
              </ul>
            )}

            {/* Prázdná skupina — výzva doplnit cenu */}
            {empty && !editorOpenFor(sub.id) && (
              <button
                type="button"
                onClick={() => setEditor({ kind: 'new', subcategoryId: sub.id, subcategoryName: sub.name, prefillName: '' })}   /* název oboru NENÍ název úkonu — necháme prázdné, ať se ukáže našeptávač */
                className="flex w-full items-center gap-2.5 px-4 py-3.5 text-left transition hover:bg-emerald-50/50"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                  <Plus className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-700">Doplňte cenu</span>
                  <span className="block text-xs text-slate-400">
                    Zákazník si tuhle službu objedná, až bude mít cenu a délku.
                  </span>
                </span>
              </button>
            )}

            {/* Editor uvnitř skupiny */}
            <AnimatePresence>
              {editorOpenFor(sub.id) && editor.kind === 'new' && (
                <div className="border-t border-slate-100 p-3">
                  <ServiceItemEditor
                    key={`new-${sub.id}`}
                    initial={{ subcategory_id: sub.id, name: editor.prefillName, deposit_amount: vychoziZaloha }}
                    subcategoryName={sub.name}
                    serviceTypes={serviceTypes}
                    saving={saving}
                    onSave={handleSave}
                    onCancel={() => { setEditor({ kind: 'closed' }); setError(null) }}
                  />
                </div>
              )}
            </AnimatePresence>

            {/* Další úkon ve stejné podkategorii */}
            {!empty && !editorOpenFor(sub.id) && (
              <button
                type="button"
                onClick={() => setEditor({ kind: 'new', subcategoryId: sub.id, subcategoryName: sub.name, prefillName: '' })}
                className="flex w-full items-center justify-center gap-1.5 border-t border-dashed border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-500 transition hover:bg-emerald-50/50 hover:text-emerald-700"
              >
                <Plus className="h-3.5 w-3.5" /> Další úkon v „{sub.name}"
              </button>
            )}
          </div>
        )
      })}

      {/* ── Úkony bez podkategorie (z dřívějška) ── */}
      {orphans.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-amber-200 bg-white">
          <div className="border-b border-amber-100 bg-amber-50/70 px-4 py-2.5">
            <p className="text-sm font-bold text-amber-900">Nezařazené úkony</p>
            <p className="mt-0.5 text-xs leading-relaxed text-amber-800">
              Tyhle jste přidali dřív, než se ceník dělil podle podkategorií. Fungují dál —
              když je otevřete a uložíte, zařadí se ke správné skupině.
            </p>
          </div>
          <ul className="divide-y divide-slate-100">
            {orphans.map(renderItem)}
          </ul>
        </div>
      )}

      {/* ── CHYBĚJÍCÍ CENÍK ──
          Dole, ne nahoře: nahoře strašilo dřív, než měl člověk šanci něco
          přidat. Zmizí samo, jakmile má každá služba aspoň jeden úkon. */}
      {prazdneSkupiny.length > 0 && subcategories.length > 0 && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
          <p className="flex items-center gap-2 text-sm font-bold text-amber-900">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {prazdneSkupiny.length === 1
              ? 'Jedna služba je zatím bez úkonu'
              : `${prazdneSkupiny.length} služby jsou zatím bez úkonu`}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-amber-800">
            <strong>{prazdneSkupiny.map(g => g.name).join(', ')}</strong> — objednat se z nich nedá.
            Stačí přidat úkon; cenu můžete nechat dohodou.
          </p>
        </div>
      )}

      {/* Editor úpravy — mimo skupiny, ať se neplete s přidáváním */}
      <AnimatePresence>
        {editor.kind === 'edit' && (
          <ServiceItemEditor
            key={editor.item.id}
            initial={itemToValues(editor.item)}
            subcategoryName={
              subcategories.find((s) => s.id === (editor.item as any).subcategory_id)?.name ?? null
            }
            serviceTypes={serviceTypes}
            saving={saving}
            onSave={handleSave}
            onCancel={() => { setEditor({ kind: 'closed' }); setError(null) }}
          />
        )}
      </AnimatePresence>

      {/* Potvrzení mazání */}
      <AnimatePresence>
        {confirmDelete && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
            onClick={() => setConfirmDelete(null)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }}
              onClick={(e: MouseEvent) => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
            >
              <div className="mb-3 flex items-center gap-2.5">
                <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-red-50 text-red-600">
                  <AlertTriangle className="h-5 w-5" />
                </span>
                <h4 className="text-base font-extrabold text-slate-900">Smazat úkon?</h4>
              </div>
              <p className="text-sm leading-relaxed text-slate-600">
                Úkon <strong className="text-slate-900">{confirmDelete.item.name}</strong> se odstraní z ceníku.
              </p>
              {confirmDelete.orders > 0 && (
                <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
                  K tomuto úkonu {confirmDelete.orders === 1 ? 'patří 1 objednávka' : `patří ${confirmDelete.orders} ${confirmDelete.orders < 5 ? 'objednávky' : 'objednávek'}`}.
                  Historie objednávek zůstane zachovaná — jen se odpojí od tohoto úkonu.
                </p>
              )}
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(null)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:border-slate-300"
                >
                  Zrušit
                </button>
                <button
                  type="button"
                  onClick={doDelete}
                  disabled={busy?.action === 'delete'}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
                >
                  {busy?.action === 'delete' ? <><Loader2 className="h-4 w-4 animate-spin" /> Mažu…</> : 'Smazat úkon'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}