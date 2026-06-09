// app/api/ares/route.ts
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const ico = searchParams.get('ico')

  if (!ico || !/^\d{8}$/.test(ico)) {
    return NextResponse.json({ error: 'IČO musí mít přesně 8 číslic.' }, { status: 400 })
  }

  try {
    const res = await fetch(
      `https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/${ico}`,
      { headers: { Accept: 'application/json', 'User-Agent': 'Propojo/1.0' } }
    )

    if (res.status === 404) {
      return NextResponse.json({ error: 'IČO nebylo nalezeno v registru ARES.' }, { status: 404 })
    }
    if (!res.ok) {
      return NextResponse.json({ error: 'Chyba při ověřování IČO.' }, { status: res.status })
    }

    const data = await res.json()
    return NextResponse.json({
      ico: data.ico,
      obchodniJmeno: data.obchodniJmeno,
      sidlo: {
        nazevObce: data.sidlo?.nazevObce ?? '',
        nazevUlice: data.sidlo?.nazevUlice ?? '',
        cisloDomovni: data.sidlo?.cisloDomovni ?? null,
      },
      pravniForma: data.pravniForma?.nazev ?? '',
      datumVzniku: data.datumVzniku ?? '',
    })
  } catch (err) {
    console.error('[ARES]', err)
    return NextResponse.json({ error: 'Nelze se připojit k ARES.' }, { status: 500 })
  }
}
