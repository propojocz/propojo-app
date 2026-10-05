// lib/calendar-links.ts
// Odkazy „Přidat do kalendáře“ podle zařízení (běží v prohlížeči).
// iPhone / iPad → Apple Kalendář přes .ics, Android → Google Kalendář, počítač → obojí.

export type CalendarPlatform = 'ios' | 'android' | 'other'

export function detectCalendarPlatform(): CalendarPlatform {
  if (typeof navigator === 'undefined') return 'other'
  const ua = navigator.userAgent || ''
  // iPadOS se hlásí jako Mac, pozná se podle dotykové obrazovky
  const isIpadOs = /Macintosh/.test(ua) && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1
  if (/iPhone|iPad|iPod/.test(ua) || isIpadOs) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return 'other'
}

/** .ics pro potvrzenou rezervaci (Apple Kalendář, Outlook, Samsung…) */
export function icsUrl(orderId: string): string {
  return `/api/kalendar/${orderId}`
}

/** Událost v Google Kalendáři (otevře se předvyplněná, uživatel ji jen uloží) */
export function googleCalendarUrl(b: {
  orderId: string
  title: string
  startIso: string
  endIso: string | null
  place: string | null
  arrivalWindow: boolean
}): string {
  const fmt = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const end = b.endIso ?? new Date(new Date(b.startIso).getTime() + 3600_000).toISOString()
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://propojo.cz'
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: b.title,
    dates: `${fmt(b.startIso)}/${fmt(end)}`,
    details: `${b.arrivalWindow ? 'Čas je okno příjezdu. ' : ''}${origin}/dashboard/objednavky/${b.orderId}`,
    ...(b.place ? { location: b.place } : {}),
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}
