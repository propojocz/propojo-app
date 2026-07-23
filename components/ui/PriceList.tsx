'use client'
// components/ui/PriceList.tsx
// Ceník úkonů jedné karty. Obaluje ServiceItemEditor (rozbalovací panel).
//
// Dvě fáze ukládání (odsouhlaseno): karta musí existovat (mít serviceId),
// teprve pak sem chodí úkony. Když serviceId chybí (nová, ještě neuložená karta),
// ceník ukáže výzvu „nejdřív ulož kartu".
//
// Řazení: šipky ↑↓ (bez knihovny). Backend reorderServiceItems zvládne i drag&drop,
// kdybychom ho někdy přidali — stačí vyměnit ovládání, logika zůstane.

import { useState, type MouseEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Plus, Pencil, Trash2, Eye, EyeOff, ArrowUp, ArrowDown, Loader2, AlertTriangle,
} from 'lucide-react'
import type { ServiceItem } from '@/types/database'
import { PRICE_UNIT_LABELS } from '@/types/database'
import {
  createServiceItem, updateServiceItem, deleteServiceItem,
  toggleServiceItemActive, reorderServiceItems, countItemOrders,
} from '@/lib/actions/service-items'
import ServiceItemEditor, {
  type ServiceItemValues, type ServiceTypeOption,
} from '@/components/ui/ServiceItemEditor'

interface Props {
  serviceId: string | null
  items: ServiceItem[]
  serviceTypes: ServiceTypeOption[]
  /** Zavolá se po každé změně ceníku, ať si rodič načte aktuální položky. */
  onChanged?: () => void
}

// Řádek → hodnoty pro editor.
function itemToValues(it: ServiceItem): ServiceItemValues {
  return {
    id: it.id,
    service_type_id: it.service_type_id,
    name: it.name,
    payment_model: (it.payment_model as 'A' | 'B') ?? 'A',
    price_type: (it.price_type as ServiceItemValues['price_type']) ?? 'fixed',
    price: it.price,
    price_unit: (it.price_unit as ServiceItemValues['price_unit']) ?? 'ukon',
    price_max: it.price_max,
    duration_minutes: it.duration_minutes,
    deposit_amount: it.deposit_amount,
    price_includes_material: it.price_includes_material ?? true,
    price_note: it.price_note,
    is_active: it.is_active,
  }
}

// Souhrnný řádek ceny pod názvem úkonu.
function itemSummary(it: ServiceItem): string {
  const parts: string[] = []
  const unit = PRICE_UNIT_LABELS[(it.price_unit as keyof typeof PRICE_UNIT_LABELS)] ?? ''

  if (it.payment_model === 'B') {
    parts.push('Nacenění na místě')
  } else if (it.price_type === 'on_agreement') {
    parts.push('Cena dohodou')
  } else if (it.price_type === 'range' && it.price != null && it.price_max != null) {
    parts.push(`${it.price.toLocaleString('cs-CZ')} – ${it.price_max.toLocaleString('cs-CZ')} Kč`)
  } else if (it.price != null && it.price > 0) {
    parts.push(`${it.price.toLocaleString('cs-CZ')} Kč ${unit}`.trim())
  } else {
    parts.push('Cena dohodou')
  }

  if (it.duration_minutes) parts.push(`${it.duration_minutes} min`)
  if (it.payment_model !== 'B' && it.deposit_amount) parts.push(`záloha ${it.deposit_amount.toLocaleString('cs-CZ')} Kč`)
  if (it.payment_model !== 'B' && it.price_type !== 'on_agreement') {
    parts.push(it.price_includes_material ? 'materiál v ceně' : 'bez materiálu')
  }
  return parts.join(' · ')
}

type EditorState =
  | { kind: 'closed' }
  | { kind: 'new' }
  | { kind: 'edit'; item: ServiceItem }

type Busy = { id: string; action: 'toggle' | 'delete' | 'move' } | null

export default function PriceList({ serviceId, items, serviceTypes, onChanged }: Props) {
  const [editor, setEditor] = useState<EditorState>({ kind: 'closed' })
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState<Busy>(null)
  const [error, setError] = useState<string | null>(null)
  // Potvrzení mazání: null nebo detail položky + počet objednávek
  const [confirmDelete, setConfirmDelete] = useState<{ item: ServiceItem; orders: number } | null>(null)

  const sorted = [...items].sort((a, b) => a.sort_order - b.sort_order)

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

  // ── Skrýt / zveřejnit ──
  const handleToggle = async (it: ServiceItem) => {
    setBusy({ id: it.id, action: 'toggle' }); setError(null)
    const res = await toggleServiceItemActive(it.id, !it.is_active)
    setBusy(null)
    if (res.success) onChanged?.()
    else setError(res.error)
  }

  // ── Klik na koš → zjisti počet objednávek, otevři potvrzení ──
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

  // ── Přesun nahoru/dolů ──
  const move = async (index: number, dir: -1 | 1) => {
    if (!serviceId) return
    const target = index + dir
    if (target < 0 || target >= sorted.length) return
    const reordered = [...sorted]
    ;[reordered[index], reordered[target]] = [reordered[target], reordered[index]]
    setBusy({ id: sorted[index].id, action: 'move' }); setError(null)
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
          Jakmile kartu uložíte, otevře se tu ceník, kam přidáte jednotlivé úkony s cenou, délkou a zálohou.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {/* Seznam položek */}
      {sorted.length > 0 ? (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {sorted.map((it, index) => {
            const isBusy = busy?.id === it.id
            const modelBadge = it.payment_model === 'B'
              ? { text: 'B — nacenění', cls: 'bg-blue-50 text-blue-700' }
              : { text: 'A — záloha', cls: 'bg-emerald-50 text-emerald-700' }
            return (
              <li key={it.id} className={`flex items-center gap-3 px-3 py-3 sm:px-4 ${!it.is_active ? 'opacity-55' : ''}`}>
                {/* Šipky řazení */}
                <div className="flex flex-none flex-col">
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    disabled={index === 0 || isBusy}
                    className="rounded p-0.5 text-slate-300 hover:text-slate-600 disabled:opacity-30"
                    aria-label="Posunout nahoru"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    disabled={index === sorted.length - 1 || isBusy}
                    className="rounded p-0.5 text-slate-300 hover:text-slate-600 disabled:opacity-30"
                    aria-label="Posunout dolů"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Název + souhrn */}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{it.name}</p>
                  <p className="mt-0.5 truncate text-xs text-slate-500">{itemSummary(it)}</p>
                </div>

                {/* Odznak modelu / stavu */}
                <span className={`hidden flex-none rounded-md px-2 py-0.5 text-[11px] font-bold sm:inline ${it.is_active ? modelBadge.cls : 'bg-slate-100 text-slate-500'}`}>
                  {it.is_active ? modelBadge.text : 'Skryto'}
                </span>

                {/* Akce */}
                <div className="flex flex-none items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleToggle(it)}
                    disabled={isBusy}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40"
                    title={it.is_active ? 'Skrýt z ceníku' : 'Zveřejnit'}
                  >
                    {busy?.id === it.id && busy.action === 'toggle'
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : it.is_active ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditor({ kind: 'edit', item: it })}
                    disabled={isBusy}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-40"
                    title="Upravit úkon"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => askDelete(it)}
                    disabled={isBusy}
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
          })}
        </ul>
      ) : (
        editor.kind === 'closed' && (
          <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center">
            <p className="text-sm font-semibold text-slate-600">Ceník je zatím prázdný</p>
            <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-slate-400">
              Přidejte první úkon — třeba „Dámský střih" nebo „Výmalba pokoje". Každý má vlastní cenu, délku a zálohu.
            </p>
          </div>
        )
      )}

      {/* Editor (rozbalovací panel) */}
      <AnimatePresence>
        {editor.kind !== 'closed' && (
          <ServiceItemEditor
            key={editor.kind === 'edit' ? editor.item.id : 'new'}
            initial={editor.kind === 'edit' ? itemToValues(editor.item) : undefined}
            serviceTypes={serviceTypes}
            saving={saving}
            onSave={handleSave}
            onCancel={() => { setEditor({ kind: 'closed' }); setError(null) }}
          />
        )}
      </AnimatePresence>

      {/* Tlačítko Přidat úkon (skryté, když je otevřený editor nové položky) */}
      {editor.kind !== 'new' && (
        <button
          type="button"
          onClick={() => { setEditor({ kind: 'new' }); setError(null) }}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-emerald-300 bg-emerald-50/50 px-4 py-3 text-sm font-semibold text-emerald-700 transition hover:border-emerald-400 hover:bg-emerald-50"
        >
          <Plus className="h-4 w-4" /> Přidat úkon do ceníku
        </button>
      )}

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