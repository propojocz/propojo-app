// lib/actions/qr-types.ts
// Typy pro QR kódy. Schválně ZVLÁŠŤ: soubor `qr.ts` má 'use server'
// a v takovém souboru smí být exportované jen async funkce — cokoli
// jiného shodí build. Typy proto bydlí tady.

export type QrCil = {
  id: string | null          // service_id; null = kód míří na profil
  itemId: string | null      // konkrétní úkon z ceníku
  nazev: string
  popis: string
}

export type QrKod = {
  id: string
  token: string
  url: string
  cilUrl: string
  scanCount: number
  serviceId: string | null
  serviceItemId: string | null
}

export type QrStatistika = {
  celkem: number
  tydne: number
  poDnech: Array<{ den: string; pocet: number }>
}