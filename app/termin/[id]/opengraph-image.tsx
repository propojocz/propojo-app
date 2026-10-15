// app/termin/[id]/opengraph-image.tsx
// Náhled odkazu na volný termín (Facebook, WhatsApp, Messenger…) – 1200×630, v barvách Propoja.
// Bez QR (náhled je sám odkazem). Písmo Poppins se stahuje z Google Fonts jen pro použité znaky;
// když stažení selže, použije se výchozí písmo.

import { ImageResponse } from 'next/og'
import { loadSlotShareInfo } from '@/lib/slot-share-data'

export const alt = 'Volný termín na Propojo'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

async function poppins(text: string, weight: number): Promise<ArrayBuffer | null> {
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=Poppins:wght@${weight}&text=${encodeURIComponent(text)}`)).text()
    const src = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/)?.[1]
    if (!src) return null
    const res = await fetch(src)
    return res.ok ? await res.arrayBuffer() : null
  } catch {
    return null
  }
}

export default async function Image({ params }: { params: { id: string } }) {
  const info = await loadSlotShareInfo(params.id)
  const tz = 'Europe/Prague'
  const when = info
    ? `${new Intl.DateTimeFormat('cs-CZ', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'numeric' }).format(new Date(info.startsAt))} · ${new Intl.DateTimeFormat('cs-CZ', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(new Date(info.startsAt))}–${new Intl.DateTimeFormat('cs-CZ', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(new Date(info.endsAt))}`
    : ''
  const name = info?.providerName ?? 'Propojo'
  const title = info?.title ?? 'Volný termín'
  const detail = info
    ? [info.durationMin ? `${info.durationMin} min` : null, info.priceFromKc != null ? `od ${info.priceFromKc.toLocaleString('cs-CZ')} Kč` : null, info.city].filter(Boolean).join(' · ')
    : ''

  const services = (info?.items ?? []).filter((n) => n !== title).join(', ')
  const allText = `${name}${title}${when}${detail}${services}BLESKOVÝ TERMÍNRezervujte na Propojo propojo.cz0123456789·–:…`
  const [bold, medium] = await Promise.all([poppins(allText, 800), poppins(allText, 500)])
  const fonts = [
    ...(bold ? [{ name: 'Poppins', data: bold, weight: 800 as const, style: 'normal' as const }] : []),
    ...(medium ? [{ name: 'Poppins', data: medium, weight: 500 as const, style: 'normal' as const }] : []),
  ]

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          padding: '56px 64px', fontFamily: 'Poppins',
          background: 'radial-gradient(circle at 0% 0%, rgba(59,130,246,0.18), rgba(255,255,255,0) 45%), radial-gradient(circle at 100% 30%, rgba(16,185,129,0.16), rgba(255,255,255,0) 40%), radial-gradient(circle at 100% 100%, rgba(245,158,11,0.16), rgba(255,255,255,0) 45%), #f8fafc',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          {info?.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={info.avatarUrl} width={96} height={96} style={{ borderRadius: 20, objectFit: 'cover', border: '3px solid #e2e8f0' }} alt="" />
          ) : (
            <div style={{ width: 96, height: 96, borderRadius: 20, background: '#ecfdf5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 44, fontWeight: 800 }}>
              {name.trim()[0]?.toUpperCase() ?? 'P'}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 40, fontWeight: 800, color: '#0f172a' }}>{name.length > 34 ? `${name.slice(0, 33)}…` : name}</div>
            <div style={{ display: 'flex', marginTop: 6, padding: '6px 18px', borderRadius: 999, background: '#ecfdf5', color: '#059669', fontSize: 22, fontWeight: 800 }}>
              ⚡ BLESKOVÝ TERMÍN
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 60, fontWeight: 800, color: '#0f172a', lineHeight: 1.1 }}>
            {title.length > 44 ? `${title.slice(0, 43)}…` : title}
          </div>
          <div style={{ display: 'flex', marginTop: 14, fontSize: 38, fontWeight: 800, color: '#2563eb' }}>{when}</div>
          <div style={{ display: 'flex', marginTop: 6, fontSize: 30, fontWeight: 500, color: '#475569' }}>
            {[detail, services].filter(Boolean).join(' · ').slice(0, 110)}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', fontSize: 26, fontWeight: 500, color: '#475569' }}>
          Rezervujte na&nbsp;<span style={{ color: '#2563eb', fontWeight: 800 }}>Propojo</span>&nbsp;· propojo.cz
        </div>
      </div>
    ),
    { ...size, fonts: fonts.length ? fonts : undefined },
  )
}
