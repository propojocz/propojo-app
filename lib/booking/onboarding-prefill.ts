// lib/booking/onboarding-prefill.ts
// Vrstva 3e: kratší Stripe onboarding. Údaje, které už o poskytovateli máme, předvyplníme
// při zakládání Standard účtu – Stripe se na ně v onboardingu neptá, jen je nechá potvrdit.
//
// Podle Stripe (docs „Using Standard connected accounts“, ověřeno 8. 10. 2026):
//  - předvyplnit jde cokoli na objektu Account (company, individual, business_profile…),
//  - KYC údaje jdou zapsat JEN před prvním Account Linkem – proto jen u nově zakládaného účtu,
//  - IČO patří do company.tax_id („business ID number“), DIČ do company.vat_id.
//
// Zdroje: profil (telefon, IČO, název), ARES (právní forma, DIČ, sídlo), první aktivní karta
// (kategorie → MCC, popis). Nic se nehádá: co nevíme jistě, nepředvyplňujeme.

import type Stripe from 'stripe'

/** Kategorie karty (tabulka categories) → MCC kód pro Stripe */
const MCC_BY_CATEGORY: Record<string, string> = {
  'dum-a-byt': '1799', // Special Trade Contractors
  remesla: '1520', // General Contractors – Residential and Commercial
  zahrada: '0780', // Landscaping and Horticultural Services
  uklid: '7349', // Cleaning, Maintenance and Janitorial Services
  stehovani: '4214', // Moving and Storage / Freight Carriers
  auto: '7538', // Automotive Service Shops
  it: '7379', // Computer Maintenance, Repair and Services
  online: '8999', // Professional Services
  krasa: '7230', // Beauty and Barber Shops
  zdravi: '7298', // Health and Beauty Spas
  'pece-o-lidi': '7299', // Miscellaneous Personal Services
  doucovani: '8299', // Schools and Educational Services
  zvirata: '7299', // Miscellaneous Personal Services
  'pravo-finance': '8999', // Professional Services
  firmy: '7399', // Business Services
  udalosti: '7999', // Recreation Services
}

/** Telefon do tvaru +420… (Stripe chce mezinárodní formát); jinak null */
function normalizePhone(raw: string | null | undefined): string | null {
  const p = String(raw ?? '').replace(/[\s()-]/g, '')
  if (/^\+\d{9,15}$/.test(p)) return p
  if (/^00\d{9,15}$/.test(p)) return `+${p.slice(2)}`
  if (/^\d{9}$/.test(p)) return `+420${p}`
  return null
}

type AresDetail = {
  name: string | null
  legalForm: string | null
  dic: string | null
  address: Stripe.AddressParam | null
}

async function aresDetail(ico: string): Promise<AresDetail | null> {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 5000)
    const res = await fetch(`https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/${ico}`, {
      headers: { accept: 'application/json' }, cache: 'no-store', signal: ctrl.signal,
    })
    clearTimeout(t)
    if (!res.ok) return null
    const d = await res.json()
    const s = d?.sidlo ?? {}
    const cislo = [s.cisloDomovni, s.cisloOrientacni ? `${s.cisloOrientacni}${s.cisloOrientacniPismeno ?? ''}` : null]
      .filter(Boolean).join('/')
    const ulice = s.nazevUlice ?? s.nazevCastiObce ?? s.nazevObce ?? null
    const line1 = ulice ? `${ulice}${cislo ? ` ${cislo}` : ''}` : null
    const address: Stripe.AddressParam | null = line1 && s.nazevObce && s.psc
      ? { line1, city: s.nazevObce, postal_code: String(s.psc), country: 'CZ' }
      : null
    return {
      name: d?.obchodniJmeno ?? null,
      legalForm: d?.pravniForma != null ? String(d.pravniForma) : null,
      dic: typeof d?.dic === 'string' && d.dic.trim() ? d.dic.trim() : null,
      address,
    }
  } catch (err) {
    console.warn('[onboarding] ARES nedostupný, pokračuji bez něj:', err)
    return null
  }
}

/** Právní forma z ARES → typ podnikání ve Stripe. Jen jednoznačné případy, jinak nechat na poskytovateli. */
function businessTypeOf(legalForm: string | null): 'individual' | 'company' | null {
  if (!legalForm) return null
  // 101 = fyzická osoba podnikající dle živnostenského zákona (OSVČ)
  if (legalForm === '101') return 'individual'
  // 112 = s.r.o., 121 = a.s., 111 = v.o.s., 113 = k.s., 205 = družstvo
  if (['111', '112', '113', '121', '205'].includes(legalForm)) return 'company'
  return null
}

export type PrefillInput = {
  email: string | null
  name: string | null
  phone: string | null
  ico: string | null
  /** Kategorie a popis první aktivní karty */
  category: string | null
  description: string | null
  /** Veřejný profil na Propoju (jen https) */
  url: string | undefined
  /** Výchozí popis činnosti, když karta popis nemá */
  defaultDescription: string
}

/**
 * Parametry pro stripe.accounts.create (type standard) s předvyplněnými údaji.
 * Volat jen u NOVÉHO účtu – po prvním Account Linku už Stripe KYC údaje zapsat nedovolí.
 */
export async function buildStandardAccountParams(input: PrefillInput): Promise<Stripe.AccountCreateParams> {
  const phone = normalizePhone(input.phone)
  const ares = input.ico ? await aresDetail(input.ico) : null
  const businessType = businessTypeOf(ares?.legalForm ?? null)
  const mcc = input.category ? MCC_BY_CATEGORY[input.category] : undefined
  const description = (input.description ?? '').trim().slice(0, 500) || input.defaultDescription

  const company: Stripe.AccountCreateParams.Company = {}
  if (ares?.name ?? input.name) company.name = (ares?.name ?? input.name)!
  if (input.ico) company.tax_id = input.ico
  if (ares?.dic) company.vat_id = ares.dic
  if (ares?.address) company.address = ares.address
  if (phone && businessType === 'company') company.phone = phone

  const params: Stripe.AccountCreateParams = {
    type: 'standard',
    country: 'CZ',
    email: input.email ?? undefined,
    ...(businessType ? { business_type: businessType } : {}),
    ...(Object.keys(company).length > 0 ? { company } : {}),
    ...(businessType === 'individual'
      ? { individual: { ...(input.email ? { email: input.email } : {}), ...(phone ? { phone } : {}) } }
      : {}),
    business_profile: {
      name: (ares?.name ?? input.name) ?? undefined,
      url: input.url,
      product_description: description,
      ...(mcc ? { mcc } : {}),
      ...(phone ? { support_phone: phone } : {}),
      ...(input.email ? { support_email: input.email } : {}),
    },
  }
  return params
}
