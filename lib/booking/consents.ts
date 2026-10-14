// lib/booking/consents.ts
// Uložení pokynu poskytovatele k automatickým refundům (vrstva 4, AK bod 4, model §21).
// Volá se při registraci poskytovatele, při přechodu zákazníka na poskytovatele a na stránce Výplaty.
// Ukládá přesné znění, rozsah (katalog AUTOREF), verzi katalogu a podmínek, čas, IP a prohlížeč.

import type { Db } from './payments'
import { AUTO_REFUND_TRIGGERS } from './rules'
import { AUTOREF_CATALOG_VERSION, AUTOREF_INSTRUCTION_TEXT, TERMS_VERSION } from './texts'

export async function recordRefundInstruction(
  db: Db,
  userId: string,
  meta: { ip: string | null; userAgent: string | null },
): Promise<boolean> {
  // Už odsouhlaseno v této verzi → nic nového
  const { data: existing } = await db
    .from('booking_consents')
    .select('id')
    .eq('user_id', userId)
    .eq('kind', 'provider_auto_refund_instruction')
    .eq('catalog_version', AUTOREF_CATALOG_VERSION)
    .limit(1)
  if ((existing ?? []).length > 0) return true

  const { error } = await db.from('booking_consents').insert({
    user_id: userId,
    kind: 'provider_auto_refund_instruction',
    document_version: AUTOREF_CATALOG_VERSION,
    catalog_version: AUTOREF_CATALOG_VERSION,
    terms_version: TERMS_VERSION,
    scope: [...AUTO_REFUND_TRIGGERS],
    text_snapshot: AUTOREF_INSTRUCTION_TEXT,
    ip: meta.ip,
    user_agent: meta.userAgent,
  })
  if (error) {
    console.error('[recordRefundInstruction]', error)
    return false
  }
  return true
}
