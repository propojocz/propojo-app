'use client'
// components/ui/ServiceItemEditor.tsx
// Editor JEDNÉ položky ceníku (úkonu). Řízená komponenta — nezná databázi.
//
// ZPŮSOB CENY MÍSTO MODELU A/B. Poskytovatel nevybírá „platební model" — to je
// naše vnitřní dělení. Vybírá, jak se u něj cena určuje:
//     Pevná · Od–do · Dohodou · Nacením na místě
// Poslední možnost je model B, zbytek model A. Do databáze jde pořád
// payment_model + price_type jako dřív, mění se jen to, co člověk vidí.
//
// NABÍZÍ SE JEN TO, CO DÁVÁ SMYSL. „Celou cenu předem" nejde zvolit u ceny
// od–do ani u ceny dohodou — appka by nevěděla, kolik strhnout, a zákazník by
// nevěděl, co platí. Poplatek za zrušení se ukáže jen tam, kde se něco platí
// dopředu; jinak není z čeho ho vzít.
//
// Podmínky výjezdu (poplatek za nacenění, Kč/km, doprava zdarma, lhůta) patří
// k úkonu, ne ke kartě.

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Loader2, X, Truck, Tag, ChevronDown, AlertTriangle, Package, Store, PackageCheck } from 'lucide-react'
import ItemImageUpload from '@/components/ui/ItemImageUpload'
import { PRICE_UNIT_LABELS } from '@/types/database'
import { unitShort, formatItemPrice } from '@/lib/price-format'
import { vyzadujePotvrzeni } from '@/lib/product-confirmation'
import InfoTip from '@/components/ui/InfoTip'
import type { PaymentModel, PriceType, PriceUnit } from '@/types/database'

// Typy služeb nabídnuté z podkategorií karty (pro našeptávač názvu).
export interface ServiceTypeOption {
  id: string
  name: string
}

// Strop poplatku za nedostavení/zrušení — ochrana zákazníka. Jedno místo
// pro celou platformu; kdyby se měl měnit, měň tady.
const MAX_NO_SHOW_FEE = 1000
const MIN_DEPOSIT = 200

export interface ServiceItemValues {
  id?: string                      // vyplněné jen u existující položky (režim úpravy)
  service_type_id: string | null
  /** Ke které podkategorii karty úkon patří (vrstva 13). */
  subcategory_id: string | null
  name: string
  payment_model: PaymentModel
  price_type: PriceType
  price: number | null
  price_unit: PriceUnit
  price_max: number | null
  duration_minutes: number | null
  /** U hodinové sazby: true = každá započatá hodina celá, false = poměrně podle skutečného času. */
  hourly_started_billing: boolean
  deposit_amount: number | null
  deposit_type: 'zaloha' | 'plna_platba' | 'bez_platby'
  no_show_fee: number | null
  fee_mode: 'noshow' | 'storno' | 'zadny'
  price_includes_material: boolean | null
  price_note: string | null
  is_active: boolean
  // Podmínky výjezdu — jen nacenění na místě
  quote_fee: number | null
  price_per_km: number | null
  free_km: number | null
  quote_days: number | null
  // ── VÝROBEK ──
  item_type: 'service' | 'product'
  pickup_mode: 'pickup' | 'delivery' | 'both' | null
  pickup_timing: 'opening_hours' | 'by_agreement' | null
  min_quantity_per_order: number | null
  price_unit_quantity: number
  package_quantity: number | null
  package_unit: string | null
  image_url: string | null
  stock_mode: 'stock' | 'made_to_order' | 'unlimited' | null
  stock_quantity: number | null
  max_quantity_per_order: number | null
  production_capacity: number | null
  lead_time_days: number | null
  available_days: number[] | null
}

interface Props {
  initial?: Partial<ServiceItemValues>
  serviceTypes: ServiceTypeOption[]
  /** Název podkategorie, pod kterou úkon spadá — jen k zobrazení. */
  subcategoryName?: string | null
  saving?: boolean
  onSave: (values: ServiceItemValues) => void
  onCancel: () => void
}

// Jednotky se liší podle typu položky. U VÝROBKU se ptáme dvoukrokově:
// nejdřív "jak se prodává", teprve pak konkrétní jednotka — cukrář tak nikdy
// neuvidí m³ vedle kg, ale truhlář si rozměrový prodej vybere a najde ho.
const UNITS_SERVICE: PriceUnit[] = ['ukon', 'hod', 'den', 'projekt', 'osoba', 'kus', 'm2', 'bm', 'm3']

type ProdejMode = 'kus' | 'baleni' | 'sada' | 'porce' | 'hmotnost' | 'objem' | 'rozmer'

const PRODEJ: { id: ProdejMode; popis: string; units: PriceUnit[] }[] = [
  { id: 'kus',       popis: 'za kus',       units: ['kus'] },
  { id: 'baleni',    popis: 'za balení',    units: ['baleni'] },
  { id: 'sada',      popis: 'za sadu',      units: ['sada'] },
  { id: 'porce',     popis: 'za porci',     units: ['porce'] },
  { id: 'hmotnost',  popis: 'podle váhy',   units: ['g', 'kg'] },
  { id: 'objem',     popis: 'podle objemu', units: ['ml', 'litr'] },
  { id: 'rozmer',    popis: 'podle rozměru', units: ['metr', 'm2', 'bm', 'm3'] },
]

// Z uložené jednotky zpětně odvodí, který způsob prodeje byl vybraný.
function prodejZJednotky(unit: string): ProdejMode {
  const found = PRODEJ.find(p => (p.units as string[]).includes(unit))
  return found?.id ?? 'kus'
}

const PACKAGE_UNITS: { id: string; popis: string }[] = [
  { id: 'kus', popis: 'ks' },
  { id: 'g', popis: 'g' },
  { id: 'kg', popis: 'kg' },
  { id: 'ml', popis: 'ml' },
  { id: 'litr', popis: 'l' },
]

const EMPTY: ServiceItemValues = {
  service_type_id: null,
  subcategory_id: null,
  name: '',
  payment_model: 'A',
  price_type: 'fixed',
  price: null,
  price_unit: 'ukon',
  price_max: null,
  duration_minutes: null,
  hourly_started_billing: false,
  deposit_amount: MIN_DEPOSIT,
  deposit_type: 'zaloha',
  no_show_fee: null,
  fee_mode: 'noshow',
  price_includes_material: null,   // nepovinné — „neuvedeno", dokud se poskytovatel nevyjádří
  price_note: null,
  is_active: true,
  quote_fee: null,
  price_per_km: null,
  free_km: null,
  quote_days: null,
  item_type: 'service',
  pickup_mode: null,
  pickup_timing: null,
  min_quantity_per_order: null,
  price_unit_quantity: 1,
  package_quantity: null,
  package_unit: null,
  image_url: null,
  stock_mode: null,
  stock_quantity: null,
  max_quantity_per_order: null,
  production_capacity: null,
  lead_time_days: null,
  available_days: null,
}

const DNY = [
  { n: 1, z: 'Po' }, { n: 2, z: 'Út' }, { n: 3, z: 'St' }, { n: 4, z: 'Čt' },
  { n: 5, z: 'Pá' }, { n: 6, z: 'So' }, { n: 7, z: 'Ne' },
]

const numOrNull = (v: string): number | null => (v === '' || v == null ? null : Number(v))

/** Způsob ceny, jak ho vidí poskytovatel. Do DB se překládá na model + price_type. */
type ZpusobCeny = 'pevna' | 'rozmezi' | 'dohodou' | 'naceneni'

const ZPUSOBY: { id: ZpusobCeny; popis: string }[] = [
  { id: 'pevna', popis: 'Pevná cena' },
  { id: 'rozmezi', popis: 'Od–do' },
  { id: 'dohodou', popis: 'Dohodou' },
  { id: 'naceneni', popis: 'Nacením na místě' },
]

function zpusobZHodnot(v: ServiceItemValues): ZpusobCeny {
  if (v.payment_model === 'B') return 'naceneni'
  if (v.price_type === 'range') return 'rozmezi'
  if (v.price_type === 'on_agreement') return 'dohodou'
  return 'pevna'
}

export default function ServiceItemEditor({
  initial, serviceTypes, subcategoryName = null, saving = false, onSave, onCancel,
}: Props) {
  const [v, setV] = useState<ServiceItemValues>({ ...EMPTY, ...initial })
  const [error, setError] = useState<string | null>(null)
  const [detailyOtevrene, setDetailyOtevrene] = useState(false)
  // Našeptávač názvů z katalogu — otevře se při psaní i při kliknutí do pole.
  const [naseptavacOtevreny, setNaseptavacOtevreny] = useState(false)

  const set = <K extends keyof ServiceItemValues>(key: K, val: ServiceItemValues[K]) =>
    setV(prev => ({ ...prev, [key]: val }))

  // Filtrované návrhy z katalogu. Bez textu ukážeme prvních osm, ať je vidět,
  // že se z čeho vybírat — s textem hledáme kdekoli v názvu (ne jen na začátku).
  const hledany = v.name.trim().toLowerCase()
  const navrhy = serviceTypes
    .filter(st => !hledany || st.name.toLowerCase().includes(hledany))
    .filter(st => st.name.toLowerCase() !== hledany)   // přesnou shodu už nabízet nemusíme
    .slice(0, 8)

  const zpusob = zpusobZHodnot(v)
  const jeNaceneni = zpusob === 'naceneni'
  const jePevna = zpusob === 'pevna'
  const jeVyrobek = v.item_type === 'product'
  // Dvoukrokový výběr u výrobku: způsob prodeje → jednotky, které k němu patří.
  const prodejMode = prodejZJednotky(v.price_unit)
  const aktualniJednotky: PriceUnit[] = jeVyrobek
    ? (PRODEJ.find(p => p.id === prodejMode)?.units ?? ['kus'])
    : UNITS_SERVICE
  // Živý náhled, ať poskytovatel hned vidí, co uvidí zákazník.
  const nahledCeny = formatItemPrice({
    price: v.price,
    price_max: v.price_max,
    price_type: v.price_type,
    price_unit: v.price_unit,
    price_unit_quantity: v.price_unit_quantity,
    payment_model: v.payment_model,
  })
  const jeHodinova = !jeVyrobek && !jeNaceneni && v.price_unit === 'hod'

  // „Celou cenu předem" jen tam, kde známe konečnou cenu už při rezervaci.
  // U hodinové sazby nevíme předem, jak dlouho bude práce skutečně trvat.
  const lzeCelaPlatba = jePevna && !jeHodinova
  const platba = v.deposit_type

  // Strop zálohy = NEJNIŽŠÍ deklarovaná cena. U rozmezí 500–1500 Kč je to 500:
  // kdyby zákazník složil 1200 Kč a konečná cena byla 500, vracelo by se mu.
  // U hodinové sazby konečnou cenu předem neznáme, tam se nestropuje.
  const cenovyStrop: number | null =
    !jeNaceneni && !jeHodinova && (jePevna || zpusob === 'rozmezi') && (v.price ?? 0) > 0
      ? (v.price as number)
      : null

  // Záloha vyšší než ta cena — blokuje uložení.
  const zalohaMoc =
    platba === 'zaloha' && cenovyStrop != null && (v.deposit_amount ?? 0) > cenovyStrop

  // Poplatek za nedostavení jde strhnout jen z toho, co zákazník složil.
  // U zálohy je to její výše, u platby celé ceny předem ta cena.
  const drzenaCastka: number | null = jeNaceneni
    ? null
    : platba === 'bez_platby'
      ? 0
      : platba === 'plna_platba'
        ? ((v.price ?? 0) > 0 ? (v.price as number) : null)
        : (v.deposit_amount ?? null)
  const stropPoplatku = Math.min(MAX_NO_SHOW_FEE, drzenaCastka ?? MAX_NO_SHOW_FEE)

  // Délku poskytovatel vyplňuje jen u ceny „za úkon".
  // U hodinové sazby používáme interně hodinový rezervační blok, takže ho tímto
  // dalším polem nezatěžujeme.
  const potrebaDelku = !jeVyrobek && !jeNaceneni && v.price_unit === 'ukon'

  const prepniZpusob = (z: ZpusobCeny) => {
    setV(prev => {
      const next = { ...prev }
      if (z === 'naceneni') {
        next.payment_model = 'B'
        next.price_type = 'on_agreement'
      } else {
        next.payment_model = 'A'
        next.price_type = z === 'rozmezi' ? 'range' : z === 'dohodou' ? 'on_agreement' : 'fixed'
      }
      // Když cenu předem neznáme, celá platba přestává dávat smysl.
      if (z !== 'pevna' && next.deposit_type === 'plna_platba') next.deposit_type = 'zaloha'
      return next
    })
  }

  const prepniJednotku = (unit: PriceUnit) => {
    setV(prev => ({
      ...prev,
      price_unit: unit,
      // Délka má smysl jen u ceny za úkon (zadává ji poskytovatel) a u hodinovky
      // (interní hodinový blok). U kusu/m²/bm/dne/projektu ji zahodíme, ať po
      // přepnutí jednotky nezůstane viset stará hodnota a nesvítila zákazníkovi.
      duration_minutes: unit === 'hod' ? 60 : unit === 'ukon' ? prev.duration_minutes : null,
      // U hodinové sazby není předem známá konečná cena, takže celou platbu předem nepovolíme.
      deposit_type: unit === 'hod' && prev.deposit_type === 'plna_platba' ? 'zaloha' : prev.deposit_type,
      hourly_started_billing: unit === 'hod' ? prev.hourly_started_billing : false,
      // Obsah balení patří jen k jednotce „za balení".
      package_quantity: unit === 'baleni' ? prev.package_quantity : null,
      package_unit: unit === 'baleni' ? (prev.package_unit ?? 'kus') : null,
    }))
  }

  const handleSave = () => {
    if (!v.name || v.name.trim().length < 2) { setError('Zadejte název úkonu.'); return }
    if (jePevna && (v.price == null || v.price <= 0)) {
      setError('Zadejte cenu, nebo přepněte na „Dohodou".'); return
    }
    if (zpusob === 'rozmezi' && ((v.price ?? 0) <= 0 || (v.price_max ?? 0) <= (v.price ?? 0))) {
      setError('U rozmezí zadejte cenu od a vyšší cenu do.'); return
    }
    if (potrebaDelku && (v.duration_minutes == null || v.duration_minutes <= 0)) {
      setError('Zadejte délku úkonu — podle ní se v kalendáři počítá termín.'); return
    }
    if (zalohaMoc) {
      setError(
        zpusob === 'rozmezi'
          ? 'Záloha nemůže být vyšší než spodní hranice ceny.'
          : 'Záloha nemůže být vyšší než cena úkonu.',
      )
      return
    }
    setError(null)

    // Očištění hodnot — ať do databáze nejdou nesmysly.
    const out: ServiceItemValues = { ...v, name: v.name.trim() }

    if (jeVyrobek) {
      // Výrobek: žádný kalendář, žádný výjezd, žádné nedostavení.
      out.payment_model = 'A'
      out.duration_minutes = null
      out.hourly_started_billing = false
      out.no_show_fee = null
      out.fee_mode = 'zadny'
      out.quote_fee = null
      out.price_per_km = null
      out.free_km = null
      out.quote_days = null
      if (zpusob === 'dohodou') { out.price = null; out.price_max = null }
      if (zpusob !== 'rozmezi') out.price_max = null

      if (out.stock_mode == null) out.stock_mode = 'stock'
      if (out.stock_mode === 'stock') {
        out.production_capacity = null
        out.lead_time_days = null
        out.available_days = null
        if (out.stock_quantity == null || out.stock_quantity < 0) out.stock_quantity = 0
        if (out.max_quantity_per_order != null && out.max_quantity_per_order > out.stock_quantity) {
          out.max_quantity_per_order = out.stock_quantity > 0 ? out.stock_quantity : null
        }
      } else if (out.stock_mode === 'made_to_order') {
        out.stock_quantity = null
        if (out.production_capacity == null || out.production_capacity < 1) out.production_capacity = 1
        if (out.lead_time_days == null || out.lead_time_days < 0) out.lead_time_days = 0
        const dny = (out.available_days ?? []).filter((d) => d >= 1 && d <= 7)
        out.available_days = dny.length ? Array.from(new Set(dny)).sort() : null
        if (out.max_quantity_per_order != null && out.max_quantity_per_order > out.production_capacity) {
          out.max_quantity_per_order = out.production_capacity
        }
      } else {
        out.stock_quantity = null
        out.production_capacity = null
        out.lead_time_days = null
        out.available_days = null
      }

      // Obsah balení dává smysl jen u jednotky „za balení".
      if (out.price_unit !== 'baleni' || out.package_quantity == null || out.package_quantity <= 0) {
        out.package_quantity = null
        out.package_unit = null
      } else if (!out.package_unit) {
        out.package_unit = 'kus'
      }
      if (out.price_unit_quantity == null || out.price_unit_quantity < 1) out.price_unit_quantity = 1

      // Způsob převzetí — výchozí osobní odběr.
      if (out.pickup_mode == null) out.pickup_mode = 'pickup'
      // Čas vyzvednutí dává smysl jen když je osobní odběr možný.
      if (out.pickup_mode === 'delivery') out.pickup_timing = null
      else if (out.pickup_timing == null) out.pickup_timing = 'opening_hours'

      // Minimum množství, default 1, nesmí být nad maximem.
      if (out.min_quantity_per_order == null || out.min_quantity_per_order < 1) out.min_quantity_per_order = 1
      if (out.max_quantity_per_order != null && out.min_quantity_per_order > out.max_quantity_per_order) {
        out.min_quantity_per_order = out.max_quantity_per_order
      }

      if (out.deposit_type === 'bez_platby' || out.deposit_type === 'plna_platba') {
        out.deposit_amount = null
      } else {
        if (out.deposit_amount == null || out.deposit_amount < MIN_DEPOSIT) out.deposit_amount = MIN_DEPOSIT
        if (cenovyStrop != null && out.deposit_amount > cenovyStrop) out.deposit_amount = cenovyStrop
      }

      out.price_note = out.price_note?.trim() || null
      onSave(out)
      return
    }

    // U služby výrobková pole nemají co dělat.
    out.stock_mode = null
    out.stock_quantity = null
    out.max_quantity_per_order = null
    out.min_quantity_per_order = null
    out.pickup_mode = null
    out.pickup_timing = null
    out.package_quantity = null
    out.package_unit = null
    if (out.price_unit_quantity == null || out.price_unit_quantity < 1) out.price_unit_quantity = 1
    out.production_capacity = null
    out.lead_time_days = null
    out.available_days = null

    if (jeNaceneni) {
      out.payment_model = 'B'
      out.price_type = 'on_agreement'
      out.price = null
      out.price_max = null
      out.deposit_amount = null
      out.deposit_type = 'zaloha'
      out.no_show_fee = null
      out.fee_mode = 'noshow'
      out.price_includes_material = null   // u nacenění na místě se materiál neřeší
    } else {
      out.payment_model = 'A'
      if (zpusob === 'dohodou') { out.price = null; out.price_max = null }
      if (zpusob !== 'rozmezi') out.price_max = null

      if (out.deposit_type === 'bez_platby') {
        out.deposit_amount = null
        out.no_show_fee = null
        out.fee_mode = 'zadny'
      } else if (out.deposit_type === 'plna_platba') {
        out.deposit_amount = null   // platí se celá cena, záloha se neřeší
      } else {
        if (out.deposit_amount == null || out.deposit_amount < MIN_DEPOSIT) out.deposit_amount = MIN_DEPOSIT
        // Strop až nakonec — u úkonu levnějšího než minimální záloha vyhrává cena.
        if (cenovyStrop != null && out.deposit_amount > cenovyStrop) out.deposit_amount = cenovyStrop
      }

      if (out.fee_mode == null) out.fee_mode = 'noshow'
      if (out.fee_mode === 'zadny') out.no_show_fee = null
      if (out.no_show_fee != null && out.no_show_fee <= 0) out.no_show_fee = null
      if (out.no_show_fee != null && out.no_show_fee > MAX_NO_SHOW_FEE) out.no_show_fee = MAX_NO_SHOW_FEE
      // Strop podle SROVNANÉ částky výše — poplatek nemůže být vyšší než to,
      // co platforma drží. Stejné pravidlo běží i na serveru.
      const drzeno = out.deposit_type === 'bez_platby'
        ? 0
        : out.deposit_type === 'plna_platba'
          ? ((out.price ?? 0) > 0 ? (out.price as number) : null)
          : (out.deposit_amount ?? null)
      if (out.no_show_fee != null && drzeno != null && out.no_show_fee > drzeno) {
        out.no_show_fee = drzeno > 0 ? drzeno : null
      }

      // Výjezdové podmínky patří jen k naceňovacímu úkonu.
      out.quote_fee = null
      out.price_per_km = null
      out.free_km = null
      out.quote_days = null
    }

    // Délka podle jednotky — stejné pravidlo jako na serveru v normalizeItem().
    // U nacenění je duration_minutes délka PROHLÍDKY, tu necháváme být.
    if (jeNaceneni) {
      out.hourly_started_billing = false
    } else if (out.price_unit === 'hod') {
      out.duration_minutes = 60
      out.hourly_started_billing = !!out.hourly_started_billing
      if (out.deposit_type === 'plna_platba') out.deposit_type = 'zaloha'
    } else {
      out.hourly_started_billing = false
      if (out.price_unit !== 'ukon') out.duration_minutes = null
    }

    out.price_note = out.price_note?.trim() || null
    onSave(out)
  }

  // ── Souhrn: co uvidí zákazník ──
  const castka = jeNaceneni
    ? 'nacenění na místě'
    : zpusob === 'dohodou'
      ? 'cena dohodou'
      : zpusob === 'rozmezi'
        ? `${Number(v.price ?? 0).toLocaleString('cs-CZ')} – ${Number(v.price_max ?? 0).toLocaleString('cs-CZ')} Kč`
        : `${Number(v.price ?? 0).toLocaleString('cs-CZ')} Kč`
  const jednotka = !jeNaceneni && v.price_unit !== 'ukon' ? ` ${PRICE_UNIT_LABELS[v.price_unit] ?? ''}` : ''
  const platbaText = jeNaceneni
    ? null
    : platba === 'zaloha'
      ? `záloha ${Number(v.deposit_amount ?? 0).toLocaleString('cs-CZ')} Kč`
      : platba === 'plna_platba' ? 'platba předem' : 'platí až po službě'
  const hodinoveUctovani = jeHodinova
    ? (v.hourly_started_billing
        ? 'každá započatá hodina se účtuje celá'
        : 'účtuje se poměrně podle skutečného času')
    : null

  const btn = (aktivni: boolean, disabled = false) =>
    `rounded-xl border-[1.5px] px-3 py-2.5 text-left transition ${
      disabled
        ? 'cursor-not-allowed border-slate-200 bg-slate-50 opacity-50'
        : aktivni
          ? 'border-emerald-500 bg-emerald-50'
          : 'border-slate-200 bg-white hover:border-emerald-300'
    }`

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden rounded-2xl border-2 border-emerald-200 bg-emerald-50/60"
    >
      <div className="space-y-5 p-4 sm:p-5">

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-extrabold text-emerald-800">
              {v.id
                ? (jeVyrobek ? 'Upravit výrobek' : 'Upravit úkon')
                : (jeVyrobek ? 'Nový výrobek' : 'Nová položka')}
            </h4>
            {jeVyrobek && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                <Package className="h-3 w-3" /> Výrobek
              </span>
            )}
          </div>
          <button type="button" onClick={onCancel} className="rounded-lg p-1 text-slate-400 hover:bg-white hover:text-slate-600" aria-label="Zrušit">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── CO NABÍZÍTE ──
            Služba = práce v čase (kalendář, délka). Výrobek = hmotná věc na kusy. */}
        <div>
          <label className="mb-1.5 block text-[13px] font-bold text-slate-800">Co nabízíte?</label>
          <div className="grid grid-cols-2 gap-2">
            {([['service', 'Službu', Tag], ['product', 'Výrobek', Package]] as const).map(([id, popis, Ikona]) => (
              <button
                key={id}
                type="button"
                onClick={() => setV(prev => ({
                  ...prev,
                  item_type: id,
                  // Výchozí nastavení podle typu, ať formulář hned dává smysl.
                  stock_mode: id === 'product' ? (prev.stock_mode ?? 'stock') : null,
                  pickup_mode: id === 'product' ? (prev.pickup_mode ?? 'pickup') : null,
                  // Časové/úkonové jednotky u výrobku nedávají smysl → přepnout na kus.
                  price_unit: id === 'product' && ['ukon', 'hod', 'projekt'].includes(prev.price_unit) ? 'kus' : prev.price_unit,
                  deposit_type: id === 'product' ? 'plna_platba' : prev.deposit_type,
                  payment_model: id === 'product' ? 'A' : prev.payment_model,
                  price_type: id === 'product' && prev.payment_model === 'B' ? 'fixed' : prev.price_type,
                }))}
                className={`inline-flex items-center justify-center gap-2 rounded-xl border-2 px-3 py-3 text-center text-sm font-bold transition ${
                  (v.item_type === id)
                    ? 'border-emerald-500 bg-emerald-500 text-white shadow-sm'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300'
                }`}
              >
                <Ikona className="h-4 w-4" /> {popis}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-slate-400">
            {jeVyrobek
              ? 'Hmotná věc, kterou zákazník kupuje na kusy — obložená mísa, dort, kytice.'
              : 'Práce, která zabere čas a plánuje se na termín.'}
          </p>
        </div>

        {subcategoryName && (
          <p className="flex items-center gap-1.5 rounded-lg bg-white/70 px-3 py-2 text-xs text-slate-500">
            <Tag className="h-3.5 w-3.5 text-slate-400" />
            Patří k <strong className="text-slate-700">{subcategoryName}</strong>
          </p>
        )}

        {/* ── 1. NÁZEV SLUŽBY ──
            Našeptávač z katalogu: poskytovatel začne psát a vybere hotový název.
            Jednotné názvy pomáhají vyhledávání — zákazník hledá „barvení", ne
            „barvení vlasů dámské dlouhé". Vlastní název jde napsat pořád. */}
        <div>
          <label className="mb-1.5 block text-[13px] font-bold text-slate-800">{jeVyrobek ? 'Název výrobku' : 'Název služby'}</label>
          <div className="relative">
            <input
              type="text"
              value={v.name}
              onChange={e => { set('name', e.target.value); set('service_type_id', null); setNaseptavacOtevreny(true) }}
              onFocus={() => setNaseptavacOtevreny(true)}
              onBlur={() => setTimeout(() => setNaseptavacOtevreny(false), 150)}
              maxLength={80}
              placeholder={jeVyrobek ? 'např. Svatební dort, Obložená mísa, Kytice…' : 'např. Barvení vlasů, Stěrka, Výměna baterie…'}
              className="w-full rounded-xl border-[1.5px] border-slate-200 bg-white px-3.5 py-2.5 text-[15px] outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
            />

            {naseptavacOtevreny && navrhy.length > 0 && (
              <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                {navrhy.map(st => (
                  <li key={st.id}>
                    <button
                      type="button"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => {
                        set('name', st.name)
                        set('service_type_id', st.id)
                        setNaseptavacOtevreny(false)
                      }}
                      className="block w-full px-3.5 py-2 text-left text-sm text-slate-700 transition hover:bg-emerald-50 hover:text-emerald-800"
                    >
                      {st.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="mt-1.5 text-[11.5px] leading-relaxed text-slate-400">
            {jeVyrobek
              ? 'Napište přesný název tak, jak ho uvidí zákazník.'
              : serviceTypes.length > 0
                ? 'Vyberte z návrhů, nebo napište vlastní — zákazníci hledají podle názvu služby.'
                : 'Napište službu tak, jak ji zná zákazník.'}
          </p>
        </div>

        {/* ── FOTKA POLOŽKY (nepovinné, sdílené) ──
            Jedna fotka přímo u téhle konkrétní nabídky — hlavně u výrobku dává
            smysl (zákazník vidí konkrétní dort, ne obecnou galerii karty), ale
            klidně ji přidá i poskytovatel služby. */}
        <div>
          <label className="mb-1.5 block text-[13px] font-bold text-slate-800">
            Fotka {jeVyrobek ? 'výrobku' : 'položky'} <span className="font-normal text-slate-400">(nepovinné)</span>
          </label>
          <ItemImageUpload value={v.image_url} onChange={(url) => set('image_url', url)} />
        </div>

        {/* ── 2. KOLIK TO STOJÍ ── */}
        <div>
          <label className="mb-1.5 block text-[13px] font-bold text-slate-800">Kolik to stojí?</label>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {ZPUSOBY.filter(z => !(jeVyrobek && z.id === 'naceneni')).map(z => (
              <button
                key={z.id}
                type="button"
                onClick={() => prepniZpusob(z.id)}
                className={`rounded-xl border-[1.5px] px-2 py-2 text-center text-[12.5px] font-bold transition ${
                  zpusob === z.id
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300'
                }`}
              >
                {z.popis}
              </button>
            ))}
          </div>

          {/* Pevná cena */}
          {jePevna && (
            <div className="mt-3 space-y-3">
              {/* VÝROBEK: nejdřív "jak se prodává", teprve pak konkrétní jednotka. */}
              {jeVyrobek && (
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">Jak se výrobek prodává?</label>
                  <div className="flex flex-wrap gap-1.5">
                    {PRODEJ.map(pm => (
                      <button
                        key={pm.id}
                        type="button"
                        onClick={() => prepniJednotku(pm.units[0])}
                        className={`rounded-lg border-[1.5px] px-2.5 py-1.5 text-[12.5px] font-bold transition ${
                          prodejMode === pm.id
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300'
                        }`}
                      >
                        {pm.popis}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Cena (Kč)</label>
                  <input type="number" min={0} value={v.price ?? ''} onChange={e => set('price', numOrNull(e.target.value))}
                    className="w-full rounded-xl border-[1.5px] border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-emerald-500" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Cena je za</label>
                  {/* U výrobku nabízíme jen jednotky zvoleného způsobu prodeje;
                      když má způsob jen jednu (za kus), select se nezobrazuje. */}
                  {jeVyrobek && aktualniJednotky.length <= 1 ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="number" min={1}
                        value={v.price_unit_quantity}
                        onChange={e => set('price_unit_quantity', Math.max(1, Number(e.target.value) || 1))}
                        className="w-20 rounded-xl border-[1.5px] border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
                      />
                      <span className="text-sm font-semibold text-slate-700">{unitShort(v.price_unit)}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <input
                        type="number" min={1}
                        value={v.price_unit_quantity}
                        onChange={e => set('price_unit_quantity', Math.max(1, Number(e.target.value) || 1))}
                        className="w-20 rounded-xl border-[1.5px] border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
                      />
                      <select value={v.price_unit} onChange={e => prepniJednotku(e.target.value as PriceUnit)}
                        className="min-w-0 flex-1 rounded-xl border-[1.5px] border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-emerald-500">
                        {aktualniJednotky.map(u => <option key={u} value={u}>{unitShort(u)}</option>)}
                      </select>
                    </div>
                  )}
                  <p className="mt-1 text-[11px] text-slate-400">
                    Zákazník uvidí: <strong className="text-slate-500">{nahledCeny}</strong>
                  </p>
                </div>
              </div>

              {/* Co obsahuje balení — jen u prodeje "za balení". */}
              {jeVyrobek && v.price_unit === 'baleni' && (
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">
                    Co balení obsahuje? <span className="font-normal text-slate-400">(nepovinné)</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number" min={0} step="any"
                      value={v.package_quantity ?? ''}
                      onChange={e => set('package_quantity', numOrNull(e.target.value))}
                      placeholder="např. 6"
                      className="w-24 rounded-xl border-[1.5px] border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
                    />
                    <select
                      value={v.package_unit ?? 'kus'}
                      onChange={e => set('package_unit', e.target.value)}
                      className="rounded-xl border-[1.5px] border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
                    >
                      {PACKAGE_UNITS.map(pu => <option key={pu.id} value={pu.id}>{pu.popis}</option>)}
                    </select>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                    Ukáže se zákazníkovi u ceny — předejdete tím dotazům „kolik toho dostanu?".
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Rozmezí */}
          {zpusob === 'rozmezi' && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Od (Kč)</label>
                <input type="number" min={0} value={v.price ?? ''} onChange={e => set('price', numOrNull(e.target.value))}
                  className="w-full rounded-xl border-[1.5px] border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-emerald-500" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Do (Kč)</label>
                <input type="number" min={0} value={v.price_max ?? ''} onChange={e => set('price_max', numOrNull(e.target.value))}
                  className="w-full rounded-xl border-[1.5px] border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-emerald-500" />
              </div>
            </div>
          )}

          {/* Hodinová sazba — jedno jednoduché rozhodnutí, bez nastavování délky. */}
          {jeHodinova && (
            <div className="mt-3 rounded-xl border border-slate-200 bg-white px-3.5 py-3">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={v.hourly_started_billing}
                  onChange={e => set('hourly_started_billing', e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="min-w-0">
                  <span className="block text-xs font-bold text-slate-700">Účtovat každou započatou hodinu</span>
                  <span className="mt-0.5 block text-[11.5px] leading-relaxed text-slate-400">
                    {v.hourly_started_billing
                      ? 'Např. 1 h 30 min = 2 celé hodiny.'
                      : 'Vypnuto: cena se počítá poměrně podle skutečného času, např. 300kč/1h = 450kč/1,5h.'}
                  </span>
                </span>
              </label>
            </div>
          )}

          {/* Délka — poskytovatel ji zadává jen u ceny za konkrétní úkon. */}
          {potrebaDelku && (
            <div className="mt-3">
              <label className="mb-1 block text-xs font-semibold text-slate-600">Jak dlouho (min)</label>
              <input type="number" min={0} step={5} value={v.duration_minutes ?? ''} onChange={e => set('duration_minutes', numOrNull(e.target.value))}
                placeholder="45"
                className="w-full rounded-xl border-[1.5px] border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-emerald-500" />
              <p className="mt-1 text-[11.5px] text-slate-400">Podle délky poznáme, do kterých volných oken se úkon vejde.</p>
            </div>
          )}

          {/* Nacenění na místě */}
          {jeNaceneni && (
            <div className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-white p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                <Truck className="h-3.5 w-3.5 text-slate-400" /> Podmínky výjezdu
                <InfoTip>Zákazník je vidí předem u objednávky. Cenu určíte až po prohlídce.</InfoTip>
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Za nacenění (Kč)</label>
                  <input type="number" min={0} value={v.quote_fee ?? ''} onChange={e => set('quote_fee', numOrNull(e.target.value))}
                    placeholder="0 = zdarma"
                    className="w-full rounded-xl border-[1.5px] border-slate-200 px-3 py-2.5 outline-none focus:border-emerald-500" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Prohlídka (min)</label>
                  <input type="number" min={0} step={15} value={v.duration_minutes ?? ''} onChange={e => set('duration_minutes', numOrNull(e.target.value))}
                    placeholder="60"
                    className="w-full rounded-xl border-[1.5px] border-slate-200 px-3 py-2.5 outline-none focus:border-emerald-500" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Doprava zdarma do (km)</label>
                  <input type="number" min={0} value={v.free_km ?? ''} onChange={e => set('free_km', numOrNull(e.target.value))}
                    placeholder="10"
                    className="w-full rounded-xl border-[1.5px] border-slate-200 px-3 py-2.5 outline-none focus:border-emerald-500" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Dál pak (Kč/km)</label>
                  <input type="number" min={0} value={v.price_per_km ?? ''} onChange={e => set('price_per_km', numOrNull(e.target.value))}
                    placeholder="12"
                    className="w-full rounded-xl border-[1.5px] border-slate-200 px-3 py-2.5 outline-none focus:border-emerald-500" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Nabídku dodám do (dnů)</label>
                <input type="number" min={0} value={v.quote_days ?? ''} onChange={e => set('quote_days', numOrNull(e.target.value))}
                  placeholder="3"
                  className="w-full rounded-xl border-[1.5px] border-slate-200 px-3 py-2.5 outline-none focus:border-emerald-500" />
              </div>
            </div>
          )}
        </div>

        {/* ── DOSTUPNOST VÝROBKU ── */}
        {jeVyrobek && (
          <div>
            <label className="mb-1.5 block text-[13px] font-bold text-slate-800">Dostupnost</label>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
              {([
                ['stock', 'Skladem'],
                ['made_to_order', 'Na objednávku'],
                ['unlimited', 'Bez omezení'],
              ] as const).map(([id, popis]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => set('stock_mode', id)}
                  className={`rounded-xl border-[1.5px] px-2 py-2 text-center text-[12.5px] font-bold transition ${
                    (v.stock_mode ?? 'stock') === id
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300'
                  }`}
                >
                  {popis}
                </button>
              ))}
            </div>

            {/* A) SKLADEM */}
            {(v.stock_mode ?? 'stock') === 'stock' && (
              <div className="mt-3 grid grid-cols-2 gap-3 rounded-xl bg-white/70 p-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Skladem (ks)</label>
                  <input
                    type="number" min={0}
                    value={v.stock_quantity ?? ''}
                    onChange={e => set('stock_quantity', numOrNull(e.target.value))}
                    placeholder="např. 12"
                    className="w-full rounded-lg border-[1.5px] border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
                  />
                </div>
                <p className="col-span-2 text-[11.5px] leading-relaxed text-slate-400">
                  Počet kusů si můžete kdykoli upravit — prodáváte i mimo Propojo. Po vyprodání
                  se výrobek přestane nabízet.
                </p>
              </div>
            )}

            {/* B) NA OBJEDNÁVKU */}
            {v.stock_mode === 'made_to_order' && (
              <div className="mt-3 space-y-3 rounded-xl bg-white/70 p-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600">Kapacita (ks/den)</label>
                    <input
                      type="number" min={1}
                      value={v.production_capacity ?? ''}
                      onChange={e => set('production_capacity', numOrNull(e.target.value))}
                      placeholder="např. 4"
                      className="w-full rounded-lg border-[1.5px] border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600">Předstih (dny)</label>
                    <input
                      type="number" min={0}
                      value={v.lead_time_days ?? ''}
                      onChange={e => set('lead_time_days', numOrNull(e.target.value))}
                      placeholder="např. 2"
                      className="w-full rounded-lg border-[1.5px] border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                {/* Tohle číslo neřídí jen výrobu — automaticky podle něj funguje
                    i storno při zrušení zaplacené objednávky (viz payout.ts):
                    zrušení s tímhle předstihem = plná vratka, blíž k termínu
                    se vrací míň. Provider ho nenastavuje zvlášť. */}
                {Number(v.lead_time_days ?? 0) > 0 && (
                  <p className="rounded-lg bg-white/70 px-3 py-2 text-[11px] leading-relaxed text-slate-500">
                    Podle tohohle čísla se řídí i vratka při zrušení: zákazník dostane vše zpět, když zruší
                    aspoň {v.lead_time_days} {Number(v.lead_time_days) === 1 ? 'den' : Number(v.lead_time_days)! < 5 ? 'dny' : 'dní'} předem,
                    blíž k termínu se vrací míň.
                  </p>
                )}

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Kdy lze vyzvednout / doručit</label>
                  <div className="flex flex-wrap gap-1.5">
                    {DNY.map(d => {
                      const vybrano = (v.available_days ?? []).includes(d.n)
                      return (
                        <button
                          key={d.n}
                          type="button"
                          onClick={() => {
                            const cur = v.available_days ?? []
                            set('available_days', vybrano ? cur.filter(x => x !== d.n) : [...cur, d.n].sort())
                          }}
                          className={`h-9 w-11 rounded-lg border-[1.5px] text-xs font-bold transition ${
                            vybrano
                              ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                              : 'border-slate-200 bg-white text-slate-500 hover:border-emerald-300'
                          }`}
                        >
                          {d.z}
                        </button>
                      )
                    })}
                  </div>
                  <p className="mt-1.5 text-[11.5px] leading-relaxed text-slate-400">
                    Nevyberete-li nic, platí všechny dny. Zákazník si vybere den dodání a systém
                    hlídá, aby se na něj nesešlo víc kusů, než zvládnete.
                  </p>
                </div>
              </div>
            )}

            {v.stock_mode === 'unlimited' && (
              <p className="mt-3 rounded-xl bg-white/70 px-3 py-2.5 text-[11.5px] leading-relaxed text-slate-500">
                Množství nehlídáme — výrobek půjde objednat kdykoli a v jakémkoli počtu.
              </p>
            )}

            {/* Omezení množství v objednávce — nenápadné, pro většinu výrobků 1 / bez limitu */}
            {v.stock_mode !== 'unlimited' && (
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-white/70 px-3 py-2.5">
                <span className="text-xs font-semibold text-slate-600">Omezit množství v objednávce</span>
                <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                  Min
                  <input
                    type="number" min={1}
                    value={v.min_quantity_per_order ?? ''}
                    onChange={e => set('min_quantity_per_order', numOrNull(e.target.value))}
                    placeholder="1"
                    className="w-16 rounded-lg border-[1.5px] border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-emerald-500"
                  />
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                  Max
                  <input
                    type="number" min={1}
                    value={v.max_quantity_per_order ?? ''}
                    onChange={e => set('max_quantity_per_order', numOrNull(e.target.value))}
                    placeholder="∞"
                    className="w-16 rounded-lg border-[1.5px] border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-emerald-500"
                  />
                </span>
              </div>
            )}
          </div>
        )}

        {/* ── ZPŮSOB PŘEVZETÍ (jen výrobek) ── */}
        {jeVyrobek && (
          <div>
            <label className="mb-1.5 block text-[13px] font-bold text-slate-800">Jak si zákazník výrobek převezme?</label>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
              {([
                ['pickup', 'Osobní odběr', Store],
                ['delivery', 'Doručení', Truck],
                ['both', 'Obojí', PackageCheck],
              ] as const).map(([id, popis, Ikona]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => set('pickup_mode', id)}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-xl border-[1.5px] px-2 py-2.5 text-[12.5px] font-bold transition ${
                    (v.pickup_mode ?? 'pickup') === id
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300'
                  }`}
                >
                  <Ikona className="h-4 w-4" /> {popis}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-slate-400">
              Podrobnosti doručení (cena, oblast) domluvíte se zákazníkem v chatu u objednávky.
            </p>

            {/* Kdy si zákazník může přijít — jen když je osobní odběr možný.
                Z téhle odpovědi Propojo odvodí, jestli musíte objednávku
                potvrzovat, nebo se potvrdí sama. */}
            {(v.pickup_mode ?? 'pickup') !== 'delivery' && (
              <div className="mt-3">
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">Kdy si ho může vyzvednout?</label>
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {([
                    ['opening_hours', 'Během otevírací doby', 'Zboží mám na provozovně, zákazník si přijde.'],
                    ['by_agreement', 'Po domluvě', 'Prodávám z domu nebo dílny — čas si domluvíme.'],
                  ] as const).map(([id, popis, vysvetleni]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => set('pickup_timing', id)}
                      className={`rounded-xl border-[1.5px] px-3 py-2.5 text-left transition ${
                        (v.pickup_timing ?? 'opening_hours') === id
                          ? 'border-emerald-500 bg-emerald-50'
                          : 'border-slate-200 bg-white hover:border-emerald-300'
                      }`}
                    >
                      <span className={`block text-[12.5px] font-bold ${
                        (v.pickup_timing ?? 'opening_hours') === id ? 'text-emerald-800' : 'text-slate-700'
                      }`}>{popis}</span>
                      <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-400">{vysvetleni}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Co z toho plyne — ať provider ví, co ho čeká, bez technických pojmů. */}
            <p className="mt-2 rounded-lg bg-white/70 px-3 py-2 text-[11px] leading-relaxed text-slate-500">
              {vyzadujePotvrzeni({
                stock_mode: v.stock_mode,
                pickup_mode: v.pickup_mode,
                pickup_timing: v.pickup_timing,
              })
                ? 'Objednávku vám pošleme k potvrzení — zákazník zaplatí, až ji přijmete. Na odpověď máte 24 hodin.'
                : 'Objednávka se potvrdí sama a zákazník rovnou zaplatí. Zboží máte skladem a k vyzvednutí v otevírací době.'}
            </p>
          </div>
        )}

        {/* ── 3. PLATBA PŘEDEM ── */}
        {!jeNaceneni && (
          <div>
            <label className="mb-1.5 block text-[13px] font-bold text-slate-800">Co zákazník platí předem?</label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <button type="button" onClick={() => set('deposit_type', 'zaloha')} className={btn(platba === 'zaloha')}>
                <b className="block text-[13px] text-slate-900">Zálohu</b>
                <span className="block text-[11px] text-slate-500">zbytek na místě</span>
              </button>
              <button
                type="button"
                disabled={!lzeCelaPlatba}
                onClick={() => lzeCelaPlatba && set('deposit_type', 'plna_platba')}
                className={btn(platba === 'plna_platba', !lzeCelaPlatba)}
              >
                <b className="block text-[13px] text-slate-900">Celou cenu</b>
                <span className="block text-[11px] text-slate-500">na místě už nic</span>
              </button>
              <button type="button" onClick={() => set('deposit_type', 'bez_platby')} className={btn(platba === 'bez_platby')}>
                <b className="block text-[13px] text-slate-900">Nic</b>
                <span className="block text-[11px] text-slate-500">platí až po službě</span>
              </button>
            </div>

            {!lzeCelaPlatba && (
              <p className="mt-2 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[11.5px] leading-relaxed text-amber-800">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  <strong>Celou cenu předem</strong> jde vybrat jen tehdy, když je konečná částka známá už při rezervaci.
                  {jeHodinova ? ' U hodinové sazby se konečná cena odvíjí od skutečné délky práce.' : ''}
                </span>
              </p>
            )}

            {platba === 'zaloha' && (
              <div className="mt-3">
                <label className="mb-1 block text-xs font-semibold text-slate-600">Výše zálohy (Kč)</label>
                <input type="number" min={MIN_DEPOSIT} value={v.deposit_amount ?? ''} onChange={e => set('deposit_amount', numOrNull(e.target.value))}
                  className={`w-full rounded-xl border-[1.5px] bg-white px-3 py-2.5 outline-none focus:border-emerald-500 ${zalohaMoc ? 'border-red-400' : 'border-slate-200'}`} />
                <p className="mt-1 text-[11.5px] text-slate-400">
                  Nejméně {MIN_DEPOSIT} Kč{cenovyStrop != null ? `, nejvýš ${cenovyStrop.toLocaleString('cs-CZ')} Kč` : ''}. Započítá se do konečné ceny.
                  {zpusob === 'rozmezi' && cenovyStrop != null ? ' U rozmezí platí spodní cena.' : ''}
                </p>
              </div>
            )}

            {platba === 'bez_platby' && (
              <p className="mt-2 rounded-lg bg-slate-100 px-3 py-2 text-[11.5px] leading-relaxed text-slate-600">
                Bez platby předem nejde nastavit poplatek za nedostavení — není z čeho ho strhnout.
              </p>
            )}
          </div>
        )}

        {/* ── 4. KDYŽ ZÁKAZNÍK NEPŘIJDE ── */}
        {!jeVyrobek && !jeNaceneni && platba !== 'bez_platby' && (
          <div>
            <label className="mb-1.5 block text-[13px] font-bold text-slate-800">Když zákazník nepřijde</label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <button type="button" onClick={() => set('fee_mode', 'zadny')} className={btn(v.fee_mode === 'zadny')}>
                <b className="block text-[13px] text-slate-900">Nic neúčtuji</b>
                <span className="block text-[11px] text-slate-500">záloha se vrací</span>
              </button>
              <button type="button" onClick={() => set('fee_mode', 'noshow')} className={btn(v.fee_mode === 'noshow')}>
                <b className="block text-[13px] text-slate-900">Nedorazí</b>
                <span className="block text-[11px] text-slate-500">a neozve se</span>
              </button>
              <button type="button" onClick={() => set('fee_mode', 'storno')} className={btn(v.fee_mode === 'storno')}>
                <b className="block text-[13px] text-slate-900">Zruší pozdě</b>
                <span className="block text-[11px] text-slate-500">dá vědět, ale těsně</span>
              </button>
            </div>

            {v.fee_mode !== 'zadny' && (
              <div className="mt-3">
                <input type="number" min={0} max={stropPoplatku} value={v.no_show_fee ?? ''} onChange={e => set('no_show_fee', numOrNull(e.target.value))}
                  placeholder="např. 300"
                  className="w-full rounded-xl border-[1.5px] border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-emerald-500" />
                <p className="mt-1 text-[11.5px] text-slate-400">
                  Kolik si necháte z {platba === 'plna_platba' ? 'uhrazené ceny' : 'zálohy'}.
                  Nejvýš {stropPoplatku.toLocaleString('cs-CZ')} Kč
                  {stropPoplatku < MAX_NO_SHOW_FEE ? ' — víc, než zákazník zaplatil, strhnout nejde' : ''}.
                  {' '}Zákazník to vidí u objednávky.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── Nepovinné ── */}
        <div className="rounded-xl border border-slate-200 bg-white">
          <button
            type="button"
            onClick={() => setDetailyOtevrene(o => !o)}
            className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left"
          >
            <span className="text-[12.5px] font-semibold text-slate-700">{jeVyrobek ? 'Poznámka' : 'Materiál a poznámka'}</span>
            <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${detailyOtevrene ? 'rotate-180' : ''}`} />
          </button>

          {detailyOtevrene && (
            <div className="space-y-3 border-t border-slate-100 p-3.5">
              {!jeNaceneni && !jeVyrobek && (
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                    Je v ceně materiál? <span className="font-normal text-slate-400">— nepovinné</span>
                  </label>
                  {/* Žádná třetí dlaždice: druhým kliknutím se volba zruší zpět na
                      „neuvedeno". Nevyplněné pole nesmí za poskytovatele tvrdit,
                      že materiál je v ceně. */}
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button"
                      onClick={() => set('price_includes_material', v.price_includes_material === true ? null : true)}
                      className={btn(v.price_includes_material === true)}>
                      <b className="block text-[12.5px] text-slate-900">Ano, včetně</b>
                      <span className="block text-[11px] text-slate-500">nic se nedoplácí</span>
                    </button>
                    <button type="button"
                      onClick={() => set('price_includes_material', v.price_includes_material === false ? null : false)}
                      className={btn(v.price_includes_material === false)}>
                      <b className="block text-[12.5px] text-slate-900">Účtuji zvlášť</b>
                      <span className="block text-[11px] text-slate-500">jen práce</span>
                    </button>
                  </div>
                  {v.price_includes_material === null && (
                    <p className="mt-1 text-[11px] text-slate-400">Neuvedeno — u úkonu se materiál nezmiňuje.</p>
                  )}
                </div>
              )}
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">Poznámka k ceně</label>
                <input type="text" maxLength={120} value={v.price_note ?? ''} onChange={e => set('price_note', e.target.value || null)}
                  placeholder="např. u dlouhých vlasů příplatek 100 Kč"
                  className="w-full rounded-xl border-[1.5px] border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500" />
              </div>
            </div>
          )}
        </div>

        {/* ── Souhrn: co uvidí zákazník ── */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-slate-900 px-3.5 py-2.5 text-[13px] text-white">
          <strong>{v.name.trim() || 'Úkon'}</strong>
          <span className="text-white/30">·</span>
          <span>{castka}{jednotka}</span>
          {hodinoveUctovani ? (
            <><span className="text-white/30">·</span><span className="text-emerald-200">{hodinoveUctovani}</span></>
          ) : null}
          {potrebaDelku && v.duration_minutes ? (
            <><span className="text-white/30">·</span><span className="text-emerald-200">{v.duration_minutes} min</span></>
          ) : null}
          {platbaText && (
            <><span className="text-white/30">·</span><span className="text-emerald-200">{platbaText}</span></>
          )}
        </div>

        {error && (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:border-slate-300">
            Zrušit
          </button>
          <button type="button" onClick={handleSave} disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-600 disabled:opacity-60">
            {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Ukládám…</> : (v.id ? 'Uložit změny' : 'Přidat úkon do ceníku')}
          </button>
        </div>
      </div>
    </motion.div>
  )
}