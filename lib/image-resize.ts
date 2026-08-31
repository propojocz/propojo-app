// lib/image-resize.ts
// Zmenšení a re-enkódování obrázku V PROHLÍŽEČI před nahráním na server.
//
// Běžná fotka z mobilu dnes váží 8–15 MB v rozlišení, které web nikdy
// nevyužije — žádná karta ani lightbox ji nezobrazí větší než pár set pixelů
// na výšku. Zmenšením na max. rozměr a překódováním do WebP klesne velikost
// typicky o 80–95 % bez viditelné ztráty kvality na obrazovce.
//
// POZOR: používá canvas/Image API prohlížeče (createImageBitmap, canvas).
// Importovat JEN z klientských komponent ('use client'), nikdy ze server
// komponent nebo server akcí — tam tyhle API neexistují.

export type ResizedImage = {
  blob: Blob
  /** Přípona pro název souboru v Storage. */
  ext: string
  contentType: string
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

function priponaZMime(mime: string, fallbackName: string): string {
  if (mime === 'image/webp') return 'webp'
  if (mime === 'image/png') return 'png'
  if (mime === 'image/jpeg') return 'jpg'
  return fallbackName.split('.').pop() || 'jpg'
}

/**
 * Zmenší obrázek tak, aby delší strana nepřesáhla maxDimension (menší se
 * nezvětšují), a překóduje ho do WebP. Starší Safari (< 17) umí WebP jen
 * zobrazit, ne zakódovat — canvas.toBlob v tom případě tiše vrátí jiný typ.
 * Ověříme výsledný typ a případně spadneme na JPEG, který zvládá úplně každý
 * prohlížeč.
 *
 * NIKDY NEBLOKUJE UPLOAD: když zmenšení z libovolného důvodu selže
 * (nepodporovaný formát, poškozený soubor, canvas nedostupný…), tiše vrátí
 * PŮVODNÍ soubor beze změny místo vyhození chyby. Uživatel tak nikdy nenarazí
 * na "nahrání se nezdařilo" jen kvůli optimalizaci — v nejhorším případě
 * přijde o úsporu místa, nikdy o fotku samotnou. Chyba se zaloguje do
 * konzole, ať jde příčina dohledat.
 */
export async function resizeImage(
  file: File,
  maxDimension = 1600,
  quality = 0.85,
): Promise<ResizedImage> {
  try {
    const bitmap = await createImageBitmap(file)
    try {
      const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height))
      const targetW = Math.max(1, Math.round(bitmap.width * scale))
      const targetH = Math.max(1, Math.round(bitmap.height * scale))

      const canvas = document.createElement('canvas')
      canvas.width = targetW
      canvas.height = targetH
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Prohlížeč neumí zpracovat obrázek (canvas).')
      ctx.drawImage(bitmap, 0, 0, targetW, targetH)

      let blob = await canvasToBlob(canvas, 'image/webp', quality)
      if (!blob || blob.type !== 'image/webp') {
        blob = await canvasToBlob(canvas, 'image/jpeg', quality)
      }
      if (!blob) throw new Error('canvas.toBlob vrátil null pro webp i jpeg.')

      return {
        blob,
        ext: blob.type === 'image/webp' ? 'webp' : 'jpg',
        contentType: blob.type,
      }
    } finally {
      bitmap.close()
    }
  } catch (err) {
    console.warn('[resizeImage] zmenšení selhalo, nahrávám originál beze změny:', err)
    return {
      blob: file,
      ext: priponaZMime(file.type, file.name),
      contentType: file.type || 'application/octet-stream',
    }
  }
}