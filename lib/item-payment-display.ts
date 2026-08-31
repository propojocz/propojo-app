// lib/item-payment-display.ts
// Jedno místo pro zákaznické texty o platbě u položky nabídky.
// Používá se ve veřejném ceníku i v objednávkovém modalu, aby zákazník
// všude viděl stejnou částku a stejnou formulaci.

type PaymentItem = {
  item_type?: string | null
  payment_model?: string | null
  price_type?: string | null
  price?: number | null
  price_max?: number | null
  price_unit?: string | null
  deposit_type?: string | null
  deposit_amount?: number | null
  quote_fee?: number | null
}

export type ItemPaymentDisplay = {
  action: string
  detail: string | null
  total: number | null
  upfront: number | null
  later: number | null
}

const money = (value: number) => `${value.toLocaleString('cs-CZ')} Kč`
const moneyRange = (min: number, max: number) => `${min.toLocaleString('cs-CZ')}–${max.toLocaleString('cs-CZ')} Kč`

export function getItemPaymentDisplay(item: PaymentItem, quantity = 1): ItemPaymentDisplay {
  const qty = Math.max(1, Math.floor(Number(quantity) || 1))
  const isProduct = item.item_type === 'product'
  const laterWhere = isProduct ? 'při převzetí' : 'na místě'

  if (item.payment_model === 'B') {
    const fee = Number(item.quote_fee ?? 0)
    return {
      action: 'Objednat nacenění',
      detail: fee > 0 ? `nacenění ${money(fee)}` : 'nacenění zdarma',
      total: fee > 0 ? fee : 0,
      upfront: fee > 0 ? fee : 0,
      later: null,
    }
  }

  const depositType = item.deposit_type ?? (isProduct ? 'plna_platba' : 'zaloha')
  const unitPrice = Number(item.price ?? 0)
  const hasPrice = unitPrice > 0
  const total = hasPrice ? unitPrice * qty : null
  const isRange = item.price_type === 'range' && item.price != null && item.price_max != null
  const isAgreement = item.price_type === 'on_agreement' || !hasPrice

  if (isAgreement) {
    const deposit = depositType === 'zaloha' ? Math.max(0, Number(item.deposit_amount ?? 0)) * qty : 0
    return {
      action: 'Domluvit',
      detail: deposit > 0 ? `záloha ${money(deposit)} · cena se upřesní` : 'cena se upřesní',
      total: null,
      upfront: deposit > 0 ? deposit : 0,
      later: null,
    }
  }

  if (isRange) {
    const min = Number(item.price) * qty
    const max = Number(item.price_max) * qty
    if (depositType === 'zaloha') {
      const deposit = Math.min(Math.max(0, Number(item.deposit_amount ?? 0)) * qty, min)
      return {
        action: 'Objednat',
        detail: deposit > 0 ? `záloha ${money(deposit)} · zbytek dle konečné ceny` : `cena ${moneyRange(min, max)}`,
        total: null,
        upfront: deposit > 0 ? deposit : 0,
        later: null,
      }
    }
    if (depositType === 'bez_platby') {
      return {
        action: 'Objednat',
        detail: `${moneyRange(min, max)} ${laterWhere}`,
        total: null,
        upfront: 0,
        later: null,
      }
    }
    return {
      action: 'Objednat',
      detail: `cena ${moneyRange(min, max)}`,
      total: null,
      upfront: null,
      later: null,
    }
  }

  // Hodinová služba má známou sazbu, ale ne konečnou cenu celé zakázky.
  if (!isProduct && item.price_unit === 'hod') {
    if (depositType === 'zaloha') {
      const deposit = Math.max(0, Number(item.deposit_amount ?? 0))
      return {
        action: 'Objednat',
        detail: deposit > 0 ? `záloha ${money(deposit)}` : `${money(unitPrice)} / hod`,
        total: null,
        upfront: deposit > 0 ? deposit : 0,
        later: null,
      }
    }
    return {
      action: 'Objednat',
      detail: depositType === 'bez_platby' ? `platba ${laterWhere}` : `${money(unitPrice)} / hod`,
      total: null,
      upfront: depositType === 'bez_platby' ? 0 : null,
      later: null,
    }
  }

  if (depositType === 'plna_platba') {
    return {
      action: 'Objednat',
      detail: total != null ? `zaplatíte ${money(total)}` : 'platba předem',
      total,
      upfront: total,
      later: total != null ? 0 : null,
    }
  }

  if (depositType === 'bez_platby') {
    return {
      action: 'Objednat',
      detail: total != null ? `${money(total)} ${laterWhere}` : `platba ${laterWhere}`,
      total,
      upfront: 0,
      later: total,
    }
  }

  const rawDeposit = Math.max(0, Number(item.deposit_amount ?? 0)) * qty
  const upfront = total != null ? Math.min(rawDeposit, total) : rawDeposit
  const later = total != null ? Math.max(0, total - upfront) : null

  return {
    action: 'Objednat',
    detail: upfront > 0
      ? later != null && later > 0
        ? `záloha ${money(upfront)} · ${money(later)} ${laterWhere}`
        : `zaplatíte ${money(upfront)}`
      : total != null
        ? `${money(total)} ${laterWhere}`
        : null,
    total,
    upfront,
    later,
  }
}
