// lib/slot-post.ts
// Obrázek příspěvku / story pro sdílení volného termínu – kreslí se v prohlížeči (canvas), bez knihovny.
// QR kód: qrcode-generator z CDN (stejně jako stránka QR kódů).
//
// Rozvržení podle návrhu Mateje (15. 10. 2026): logo poskytovatele + jméno, „⚡ Bleskový termín“,
// karta služby (název, den a čas, délka a cena, celý výčet služeb), QR + „Rezervujte na Propojo“,
// logo Propoja vlevo dole (bez „Máme volno. Pro Vás.“ – Matej 15. 10.). Bezpečné zóny sítí: u Story nahoře ~250 px (profilová fotka, ✕),
// dole ~330 px (řádek pro odpověď / chat) – nic důležitého tam není.

import type { SlotShareInfo } from './slot-share-data'

declare global {
  interface Window { qrcode?: any }
}

export type PostFormat = 'story' | 'square'

const C = {
  ink: '#0f172a',
  slate: '#475569',
  muted: '#64748b',
  border: '#e2e8f0',
  blue: '#2563eb',
  green: '#059669',
  greenSoft: '#ecfdf5',
  orange: '#f59e0b',
}

export function loadQrLib(): Promise<any> {
  return new Promise((resolve, reject) => {
    if (window.qrcode) return resolve(window.qrcode)
    const existing = document.querySelector<HTMLScriptElement>('script[data-qrlib]')
    const s = existing ?? document.createElement('script')
    s.addEventListener('load', () => (window.qrcode ? resolve(window.qrcode) : reject(new Error('qr'))))
    s.addEventListener('error', () => reject(new Error('qr')))
    if (!existing) {
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js'
      s.async = true
      s.dataset.qrlib = '1'
      document.head.appendChild(s)
    }
  })
}

/** QR kód jako canvas (pro obrázek i pro stažení PNG) */
export async function qrCanvas(text: string, size: number): Promise<HTMLCanvasElement> {
  const lib = await loadQrLib()
  const qr = lib(0, 'M')
  qr.addData(text)
  qr.make()
  const n = qr.getModuleCount()
  const modul = Math.max(1, Math.floor(size / (n + 4)))
  const margin = Math.floor((size - modul * n) / 2)
  const c = document.createElement('canvas')
  c.width = size; c.height = size
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, size, size)
  ctx.fillStyle = C.ink
  for (let r = 0; r < n; r++) for (let col = 0; col < n; col++) {
    if (qr.isDark(r, col)) ctx.fillRect(margin + col * modul, margin + r * modul, modul, modul)
  }
  return c
}

function loadImage(src: string, crossOrigin = true): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    if (crossOrigin) img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** Text do jednoho řádku, co se nevejde, nahradí „…“ */
function fit(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text
  let t = text
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1)
  return `${t.trimEnd()}…`
}

/** Zalomení textu do nejvýš `max` řádků; poslední řádek případně zkrátí „…“ */
function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxW: number, max: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let cur = ''
  let i = 0
  for (; i < words.length; i++) {
    const next = cur ? `${cur} ${words[i]}` : words[i]
    if (ctx.measureText(next).width <= maxW || !cur) { cur = next; continue }
    lines.push(cur)
    cur = words[i]
    if (lines.length === max - 1) { i++; break }
  }
  const rest = [cur, ...words.slice(i)].filter(Boolean).join(' ')
  if (rest) lines.push(fit(ctx, rest, maxW))
  return lines.slice(0, max)
}

const FONT = (weight: number, px: number) => `${weight} ${px}px Poppins, "DM Sans", system-ui, sans-serif`
const BODY = (weight: number, px: number) => `${weight} ${px}px "DM Sans", system-ui, sans-serif`

function terminText(info: SlotShareInfo): string {
  const tz = 'Europe/Prague'
  const den = new Intl.DateTimeFormat('cs-CZ', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'numeric' }).format(new Date(info.startsAt))
  const t = (iso: string) => new Intl.DateTimeFormat('cs-CZ', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
  return `${den} · ${t(info.startsAt)}–${t(info.endsAt)}`
}

function detailText(info: SlotShareInfo): string {
  const parts: string[] = []
  if (info.durationMin) parts.push(`${info.durationMin} min`)
  parts.push(info.priceFromKc != null ? `od ${info.priceFromKc.toLocaleString('cs-CZ')} Kč` : 'cena dohodou')
  return parts.join(' · ')
}

function background(ctx: CanvasRenderingContext2D, W: number, H: number) {
  ctx.fillStyle = '#f8fafc'
  ctx.fillRect(0, 0, W, H)
  const blob = (x: number, y: number, r: number, color: string) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, color)
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
  }
  blob(0, 0, W * 0.5, 'rgba(59,130,246,0.16)')
  blob(W, H * 0.22, W * 0.45, 'rgba(16,185,129,0.14)')
  blob(W, H * 0.68, W * 0.45, 'rgba(245,158,11,0.14)')
  blob(0, H, W * 0.5, 'rgba(59,130,246,0.14)')
}

async function avatar(ctx: CanvasRenderingContext2D, info: SlotShareInfo, x: number, y: number, s: number) {
  ctx.save()
  rr(ctx, x, y, s, s, s * 0.18)
  ctx.fillStyle = '#ffffff'; ctx.fill()
  ctx.strokeStyle = C.border; ctx.lineWidth = 3; ctx.stroke()
  ctx.clip()
  const img = info.avatarUrl ? await loadImage(info.avatarUrl) : null
  if (img) {
    const k = Math.max(s / img.width, s / img.height)
    ctx.drawImage(img, x + (s - img.width * k) / 2, y + (s - img.height * k) / 2, img.width * k, img.height * k)
  } else {
    ctx.fillStyle = C.greenSoft; ctx.fillRect(x, y, s, s)
    ctx.fillStyle = C.green; ctx.font = FONT(800, s * 0.42); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText((info.providerName.trim()[0] ?? 'P').toUpperCase(), x + s / 2, y + s / 2)
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
  }
  ctx.restore()
}

function badge(ctx: CanvasRenderingContext2D, x: number, y: number, px: number) {
  const text = 'BLESKOVÝ TERMÍN'
  ctx.font = FONT(800, px)
  const w = ctx.measureText(text).width + px * 2.6
  const h = px * 2
  rr(ctx, x, y, w, h, h / 2)
  ctx.fillStyle = C.greenSoft; ctx.fill()
  // blesk
  ctx.fillStyle = C.orange
  const bx = x + px * 0.7, by = y + h * 0.18, bh = h * 0.64
  ctx.beginPath()
  ctx.moveTo(bx + bh * 0.42, by); ctx.lineTo(bx, by + bh * 0.58); ctx.lineTo(bx + bh * 0.3, by + bh * 0.58)
  ctx.lineTo(bx + bh * 0.18, by + bh); ctx.lineTo(bx + bh * 0.62, by + bh * 0.38); ctx.lineTo(bx + bh * 0.32, by + bh * 0.38)
  ctx.closePath(); ctx.fill()
  ctx.fillStyle = C.green
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x + px * 1.75, y + h / 2 + 1)
  ctx.textBaseline = 'alphabetic'
}

async function propojoMark(ctx: CanvasRenderingContext2D, x: number, y: number, h: number) {
  const logo = await loadImage('/propojo-logo-full.png', false)
  if (logo) ctx.drawImage(logo, x, y, (logo.width / logo.height) * h, h)
}

export async function drawSlotPost(info: SlotShareInfo, format: PostFormat, url: string): Promise<HTMLCanvasElement> {
  try { await Promise.all([document.fonts.load(FONT(800, 60)), document.fonts.load(BODY(500, 40))]) } catch { /* výchozí písmo */ }
  const W = 1080
  const H = format === 'story' ? 1920 : 1080
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const ctx = c.getContext('2d')!
  background(ctx, W, H)

  const story = format === 'story'
  const M = story ? 80 : 70
  // Story: obsah začíná pod horní zónou (profil, ✕), končí nad dolní zónou (chat)
  let y = story ? 270 : 70

  // Poskytovatel – jen malým (hlavní je karta a její služby; Matej 15. 10.)
  const av = story ? 104 : 84
  await avatar(ctx, info, M, y, av)
  ctx.fillStyle = C.ink
  ctx.font = FONT(700, story ? 38 : 32)
  ctx.fillText(fit(ctx, info.providerName, W - M * 2 - av - 26), M + av + 26, y + av * 0.46)
  if (info.city) {
    ctx.fillStyle = C.slate
    ctx.font = BODY(500, story ? 30 : 26)
    ctx.fillText(fit(ctx, info.city, W - M * 2 - av - 26), M + av + 26, y + av * 0.84)
  }
  y += av + (story ? 44 : 30)

  badge(ctx, M, y, story ? 34 : 28)
  // Pod štítkem volné místo – na Instagramu si sem poskytovatel přidá vlastní text
  y += (story ? 34 : 28) * 2 + (story ? 240 : 90)

  // Karta: název karty (hlavní), služby z ceníku v termínu (celé, bez cen), den a čas, malým „od … Kč“
  const cardTop = y
  const cardMaxEnd = story ? 1170 : 740 // pod kartou musí zůstat místo na QR a logo
  const cx = M + 20
  const innerW = W - cx * 2
  const tp = story ? 66 : 50
  const tl = tp * 1.16
  const ip = story ? 40 : 32
  const il = ip * 1.32
  const dp = story ? 48 : 38
  const ep = story ? 32 : 26
  const padT = story ? 54 : 40
  const padB = story ? 44 : 30
  const gap = story ? 22 : 14

  ctx.font = FONT(800, tp)
  const titleLines = wrapLines(ctx, info.title, innerW, 2)
  const services = info.items.filter((n) => n !== info.title)
  const fixed = padT + titleLines.length * tl + gap + dp * 1.25 + ep * 1.4 + padB + (services.length ? gap : 0)
  ctx.font = BODY(600, ip)
  const maxItemLines = Math.max(1, Math.floor((cardMaxEnd - cardTop - fixed) / il))
  const itemLines = services.length ? wrapLines(ctx, services.join(', '), innerW, maxItemLines) : []
  const cardH = fixed + itemLines.length * il

  ctx.save()
  ctx.shadowColor = 'rgba(15,23,42,0.08)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 8
  rr(ctx, M - 20, cardTop, W - (M - 20) * 2, cardH, 36)
  ctx.fillStyle = 'rgba(255,255,255,0.94)'; ctx.fill()
  ctx.restore()
  rr(ctx, M - 20, cardTop, W - (M - 20) * 2, cardH, 36)
  ctx.strokeStyle = C.border; ctx.lineWidth = 2; ctx.stroke()

  let ty = cardTop + padT
  ctx.fillStyle = C.ink
  ctx.font = FONT(800, tp)
  for (const line of titleLines) { ty += tl * 0.84; ctx.fillText(line, cx, ty); ty += tl * 0.16 }
  if (itemLines.length) {
    ty += gap
    ctx.font = BODY(600, ip)
    ctx.fillStyle = C.slate
    for (const line of itemLines) { ty += il; ctx.fillText(line, cx, ty - il * 0.24) }
  }
  ty += gap
  ctx.font = BODY(700, dp)
  ctx.fillStyle = C.blue
  ty += dp
  ctx.fillText(fit(ctx, terminText(info), innerW), cx, ty)
  ty += dp * 0.25
  ctx.font = BODY(500, ep)
  ctx.fillStyle = C.muted
  ty += ep * 1.2
  ctx.fillText(fit(ctx, detailText(info), innerW), cx, ty)
  y = cardTop + cardH + (story ? 60 : 40)

  // QR + Rezervujte na Propojo
  const qs = story ? 200 : 150
  const qr = await qrCanvas(url, qs)
  rr(ctx, M, y, qs, qs, 20)
  ctx.save(); ctx.clip(); ctx.drawImage(qr, M, y, qs, qs); ctx.restore()
  rr(ctx, M, y, qs, qs, 20); ctx.strokeStyle = C.border; ctx.lineWidth = 2; ctx.stroke()
  const tx = M + qs + 50
  const rp = story ? 60 : 46
  ctx.font = FONT(800, rp)
  ctx.fillStyle = C.ink
  ctx.fillText('Rezervujte', tx, y + rp * 1.2)
  ctx.fillText('na ', tx, y + rp * 2.3)
  const naW = ctx.measureText('na ').width
  ctx.fillStyle = C.blue
  ctx.fillText('Propojo', tx + naW, y + rp * 2.3)
  ctx.font = BODY(500, story ? 32 : 26)
  ctx.fillStyle = C.slate
  ctx.fillText(fit(ctx, 'Naskenujte kód nebo klikněte na odkaz', W - tx - M), tx, y + rp * 2.3 + (story ? 62 : 46))

  // Logo Propoja vlevo dole – u Story nad zónou s chatem (dole ~330 px řádek pro odpověď)
  const markH = story ? 136 : 96
  const markY = story ? 1448 : H - markH - 28
  await propojoMark(ctx, M, markY, markH)
  return c
}

export function canvasToFile(c: HTMLCanvasElement, name: string): Promise<File | null> {
  return new Promise((resolve) => c.toBlob((b) => resolve(b ? new File([b], name, { type: 'image/png' }) : null), 'image/png'))
}

export function downloadFile(file: File) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(file)
  a.download = file.name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 4000)
}
