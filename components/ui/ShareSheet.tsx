'use client'
// components/ui/ShareSheet.tsx
// Sdílení volného termínu (15. 10. 2026): Facebook, WhatsApp, Instagram (obrázek story), odkaz, QR kód
// a obrázek příspěvku (čtverec / story) v barvách Propoja s logem poskytovatele.
// Okno se vykresluje přes portál do <body> (volá se i z jiných oken a z horní lišty).

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Copy, Download, Image as ImageIcon, Instagram, Loader2, MessageCircle, QrCode, Share2, X } from 'lucide-react'
import { getSlotShareInfo } from '@/lib/actions/slot-share'
import type { SlotShareInfo } from '@/lib/slot-share-data'
import { canvasToFile, downloadFile, drawSlotPost, qrCanvas, type PostFormat } from '@/lib/slot-post'

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M13.5 21v-7.5h2.5l.4-3h-2.9V8.6c0-.9.3-1.5 1.5-1.5h1.5V4.4c-.3 0-1.2-.1-2.2-.1-2.2 0-3.7 1.3-3.7 3.8v2.4H8v3h2.6V21h2.9z" />
    </svg>
  )
}

export default function ShareSheet({ slotId, onClose }: { slotId: string; onClose: () => void }) {
  const [info, setInfo] = useState<SlotShareInfo | null>(null)
  const [loadErr, setLoadErr] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [qrUrl, setQrUrl] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ url: string; format: PostFormat } | null>(null)
  const [note, setNote] = useState('')

  useEffect(() => {
    let alive = true
    getSlotShareInfo(slotId).then((i) => { if (!alive) return; if (i) setInfo(i); else setLoadErr(true) }).catch(() => alive && setLoadErr(true))
    return () => { alive = false }
  }, [slotId])

  const url = typeof window !== 'undefined' ? `${window.location.origin}/termin/${slotId}` : `/termin/${slotId}`
  const when = info
    ? new Intl.DateTimeFormat('cs-CZ', { timeZone: 'Europe/Prague', weekday: 'long', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(info.startsAt))
    : ''
  const text = info ? `⚡ Uvolnil se mi termín: ${when} – ${info.title}. Kdo dřív přijde… Rezervace:` : 'Volný termín – rezervace:'

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      return true
    } catch {
      window.prompt('Zkopírujte odkaz:', url)
      return false
    }
  }

  const makeFile = async (format: PostFormat): Promise<File | null> => {
    if (!info) return null
    const canvas = await drawSlotPost(info, format, url)
    return canvasToFile(canvas, `propojo-termin-${format === 'story' ? 'story' : 'prispevek'}.png`)
  }

  // Instagram z webu nejde otevřít s obsahem: na mobilu systémové sdílení s obrázkem (vyberete Instagram),
  // jinde stažení obrázku + zkopírovaný odkaz pro nálepku „Odkaz“.
  const instagram = async () => {
    setBusy('ig'); setNote('')
    try {
      const file = await makeFile('story')
      if (!file) return
      await copy()
      if (navigator.canShare?.({ files: [file] })) {
        try { await navigator.share({ files: [file] }) } catch { /* zavřeno */ }
        setNote('Odkaz je zkopírovaný – ve Story ho přidejte nálepkou „Odkaz“.')
      } else {
        downloadFile(file)
        setNote('Obrázek story je stažený a odkaz zkopírovaný. Na Instagramu přidejte obrázek do Story a odkaz nálepkou „Odkaz“.')
      }
    } finally {
      setBusy(null)
    }
  }

  const showPost = async (format: PostFormat) => {
    setBusy(format); setNote('')
    try {
      if (!info) return
      const canvas = await drawSlotPost(info, format, url)
      setPreview({ url: canvas.toDataURL('image/png'), format })
    } catch {
      setNote('Obrázek se nepodařilo vytvořit. Zkuste to prosím znovu.')
    } finally {
      setBusy(null)
    }
  }

  const sharePreview = async () => {
    if (!preview) return
    const file = await makeFile(preview.format)
    if (!file) return
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], text: `${text} ${url}` }) } catch { /* zavřeno */ }
    } else {
      downloadFile(file)
    }
  }

  const showQr = async () => {
    setBusy('qr')
    try {
      const c = await qrCanvas(url, 600)
      setQrUrl(c.toDataURL('image/png'))
    } catch {
      setNote('QR kód se nepodařilo načíst. Zkuste to prosím znovu.')
    } finally {
      setBusy(null)
    }
  }

  const nativeShare = async () => {
    try { await navigator.share({ title: 'Volný termín', text, url }) } catch { /* zavřeno */ }
  }

  const row = 'flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-left text-sm font-semibold text-slate-800 transition hover:border-emerald-300 hover:bg-emerald-50/40 disabled:opacity-60'

  const body = (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-900/40 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="flex max-h-[92dvh] w-full max-w-sm flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <p className="flex items-center gap-1.5 font-black text-slate-900"><Share2 className="h-4 w-4 text-emerald-600" /> Sdílet termín</p>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100" aria-label="Zavřít">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {loadErr ? (
            <p className="text-sm text-red-600">Termín se nepodařilo načíst.</p>
          ) : !info ? (
            <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Načítám…</p>
          ) : preview ? (
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview.url} alt="Náhled příspěvku" className={`mx-auto rounded-xl border border-slate-200 ${preview.format === 'story' ? 'max-h-[60dvh] w-auto' : 'w-full'}`} />
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setPreview(null)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">Zpět</button>
                <button type="button" onClick={sharePreview} className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2.5 text-sm font-bold text-white hover:bg-emerald-700">
                  <Download className="h-4 w-4" /> Uložit / sdílet
                </button>
              </div>
            </div>
          ) : qrUrl ? (
            <div className="text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrUrl} alt="QR kód termínu" className="mx-auto w-56 rounded-xl border border-slate-200" />
              <p className="mt-2 text-xs text-slate-500">Kód vede přímo na tento termín.</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setQrUrl(null)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">Zpět</button>
                <a href={qrUrl} download="propojo-termin-qr.png" className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2.5 text-sm font-bold text-white hover:bg-emerald-700">
                  <Download className="h-4 w-4" /> Stáhnout QR
                </a>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="mb-1 text-xs leading-relaxed text-slate-500">
                {when} · {info.title}. Kdokoli s odkazem uvidí volný termín a může se rovnou objednat.
              </p>
              <a className={row} href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`} target="_blank" rel="noopener noreferrer">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#1877f2] text-white"><FacebookIcon className="h-5 w-5" /></span> Facebook
              </a>
              <a className={row} href={`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`} target="_blank" rel="noopener noreferrer">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#25d366] text-white"><MessageCircle className="h-5 w-5" /></span> WhatsApp
              </a>
              <button type="button" className={row} onClick={instagram} disabled={busy !== null}>
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#f58529] via-[#dd2a7b] to-[#8134af] text-white">
                  {busy === 'ig' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Instagram className="h-5 w-5" />}
                </span>
                Instagram Story
              </button>
              <button type="button" className={row} onClick={() => showPost('square')} disabled={busy !== null}>
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                  {busy === 'square' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-5 w-5" />}
                </span>
                Obrázek příspěvku (čtverec)
              </button>
              <button type="button" className={row} onClick={() => showPost('story')} disabled={busy !== null}>
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                  {busy === 'story' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-5 w-5" />}
                </span>
                Obrázek na Story (na výšku)
              </button>
              <button type="button" className={row} onClick={showQr} disabled={busy !== null}>
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                  {busy === 'qr' ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-5 w-5" />}
                </span>
                QR kód
              </button>
              <button type="button" className={row} onClick={copy}>
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                  {copied ? <Check className="h-5 w-5 text-emerald-600" /> : <Copy className="h-5 w-5" />}
                </span>
                {copied ? 'Odkaz zkopírován' : 'Kopírovat odkaz'}
              </button>
              {typeof navigator !== 'undefined' && 'share' in navigator && (
                <button type="button" className={row} onClick={nativeShare}>
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700"><Share2 className="h-5 w-5" /></span>
                  Další možnosti…
                </button>
              )}
              {!info.available && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Termín už není volný – zákazníci uvidí, že je obsazený, a nabídku dalších termínů.</p>
              )}
            </div>
          )}
          {note && <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs leading-relaxed text-emerald-800">{note}</p>}
        </div>
      </div>
    </div>
  )

  return typeof document !== 'undefined' ? createPortal(body, document.body) : null
}
