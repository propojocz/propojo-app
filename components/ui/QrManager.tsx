'use client'
// components/ui/QrManager.tsx
// QR kód poskytovatele — výběr cíle, náhled, stažení, tiskové šablony.
//
// QR se kreslí v prohlížeči (knihovna qrcode-generator z CDN), takže
// nepotřebuje žádný balíček navíc a stránka je hned.

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { QrCode, Download, Copy, Check, Loader2, Printer, Eye } from 'lucide-react'
import { getOrCreateQrKod, getQrStatistika } from '@/lib/actions/qr'
import type { QrCil, QrKod, QrStatistika } from '@/lib/actions/qr'

declare global {
  interface Window { qrcode?: any }
}

export default function QrManager({ cile }: { cile: QrCil[] }) {
  const [vybrany, setVybrany] = useState<QrCil | null>(cile[0] ?? null)
  const [kod, setKod] = useState<QrKod | null>(null)
  const [stat, setStat] = useState<QrStatistika | null>(null)
  const [nacitam, setNacitam] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [zkopirovano, setZkopirovano] = useState(false)
  const [libReady, setLibReady] = useState(false)
  const qrRef = useRef<HTMLDivElement>(null)

  // Knihovna na kreslení QR
  useEffect(() => {
    if (window.qrcode) { setLibReady(true); return }
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js'
    s.onload = () => setLibReady(true)
    document.body.appendChild(s)
  }, [])

  // Kód pro vybraný cíl
  useEffect(() => {
    if (!vybrany) return
    let zive = true
    setNacitam(true); setErr(null)
    getOrCreateQrKod(vybrany.id, vybrany.itemId).then(res => {
      if (!zive) return
      if (res.success) {
        setKod(res.kod)
        getQrStatistika(res.kod.id).then(s => { if (zive) setStat(s) })
      } else setErr(res.error)
      setNacitam(false)
    })
    return () => { zive = false }
  }, [vybrany])

  // Vykreslení QR
  const kresli = useCallback(() => {
    if (!libReady || !kod || !qrRef.current || !window.qrcode) return
    const qr = window.qrcode(0, 'M')
    qr.addData(kod.url)
    qr.make()
    qrRef.current.innerHTML = qr.createImgTag(10, 0)
    const img = qrRef.current.querySelector('img')
    if (img) { img.style.width = '100%'; img.style.height = 'auto'; img.style.imageRendering = 'pixelated' }
  }, [libReady, kod])

  useEffect(() => { kresli() }, [kresli])

  const kopiruj = async () => {
    if (!kod) return
    try {
      await navigator.clipboard.writeText(kod.url)
      setZkopirovano(true)
      setTimeout(() => setZkopirovano(false), 2500)
    } catch { /* nevadí */ }
  }

  // Stažení PNG ve zvolené velikosti (přes canvas, bez knihoven)
  const stahni = (velikost: number) => {
    if (!kod || !window.qrcode) return
    const qr = window.qrcode(0, 'M')
    qr.addData(kod.url)
    qr.make()
    const pocet = qr.getModuleCount()
    const modul = Math.floor(velikost / (pocet + 8))
    const okraj = modul * 4
    const strana = modul * pocet + okraj * 2

    const canvas = document.createElement('canvas')
    canvas.width = strana; canvas.height = strana
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, strana, strana)
    ctx.fillStyle = '#0f172a'
    for (let r = 0; r < pocet; r++) {
      for (let c = 0; c < pocet; c++) {
        if (qr.isDark(r, c)) ctx.fillRect(okraj + c * modul, okraj + r * modul, modul, modul)
      }
    }
    const a = document.createElement('a')
    a.download = `propojo-qr-${kod.token}.png`
    a.href = canvas.toDataURL('image/png')
    a.click()
  }

  if (cile.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
        <QrCode className="mx-auto mb-3 h-10 w-10 text-slate-300" />
        <p className="font-bold text-slate-800">Nejdřív si přidejte nabídku</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
          QR kód vede zákazníka na váš ceník a volné termíny — potřebujeme tedy nejdřív kartu.
        </p>
        <Link href="/pridat-sluzbu" className="mt-4 inline-block rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-600">
          Přidat nabídku
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* CÍL */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <label className="mb-2.5 block text-sm font-bold text-slate-600">Kam má kód vést?</label>
        <div className="space-y-2">
          {cile.map((c, i) => {
            const on = vybrany?.id === c.id && vybrany?.itemId === c.itemId
            return (
              <button
                key={`${c.id ?? 'profil'}-${i}`}
                type="button"
                onClick={() => setVybrany(c)}
                className={`flex w-full items-start gap-3 rounded-xl border-2 p-3.5 text-left transition ${
                  on ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-white hover:border-emerald-200'
                }`}
              >
                <span className="text-lg leading-none">{c.id ? '📋' : '👤'}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-slate-900">{c.nazev}</span>
                  <span className="block text-xs text-slate-500">{c.popis}</span>
                </span>
                {c.id && i === 0 && (
                  <span className="shrink-0 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white">
                    Doporučeno
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* NÁHLED + STAŽENÍ */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        {nacitam ? (
          <div className="flex items-center gap-2 py-8 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Připravuji kód…
          </div>
        ) : err ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>
        ) : kod ? (
          <div className="grid gap-6 sm:grid-cols-[200px_1fr]">
            <div className="rounded-2xl border border-slate-200 p-4">
              <div ref={qrRef} className="grid aspect-square place-items-center" />
            </div>

            <div className="min-w-0">
              <label className="mb-1.5 block text-sm font-bold text-slate-600">Odkaz v kódu</label>
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                <span className="min-w-0 flex-1 break-all text-xs text-slate-600">{kod.url}</span>
                <button onClick={kopiruj} className="shrink-0 rounded-lg bg-emerald-500 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-600">
                  {zkopirovano ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
              <p className="mt-1.5 text-xs text-slate-400">
                Krátký schválně — jde přepsat i ručně z papíru. Vede vždy na vaši aktuální kartu.
              </p>

              <label className="mb-2 mt-5 block text-sm font-bold text-slate-600">Stáhnout kód</label>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => stahni(600)} className="flex flex-col items-start rounded-xl border border-slate-200 px-3 py-2.5 text-left transition hover:border-emerald-500 hover:bg-emerald-50">
                  <span className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-800"><Download className="h-3.5 w-3.5" /> Na web</span>
                  <span className="text-[11px] text-slate-400">600 px · PNG</span>
                </button>
                <button onClick={() => stahni(2000)} className="flex flex-col items-start rounded-xl border border-slate-200 px-3 py-2.5 text-left transition hover:border-emerald-500 hover:bg-emerald-50">
                  <span className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-800"><Download className="h-3.5 w-3.5" /> Na tisk</span>
                  <span className="text-[11px] text-slate-400">2000 px · PNG</span>
                </button>
              </div>

              <Link
                href={`/dashboard/qr/tisk?token=${kod.token}`}
                className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white transition hover:bg-slate-800"
              >
                <Printer className="h-4 w-4" /> Hotové šablony k tisku
              </Link>
              <p className="mt-1.5 text-center text-[11px] text-slate-400">
                Vizitka, samolepka na zrcadlo, stojánek, plakát A4
              </p>
            </div>
          </div>
        ) : null}
      </div>

      {/* STATISTIKA */}
      {stat && kod && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <label className="mb-3 block text-sm font-bold text-slate-600">Kolikrát ho někdo načetl</label>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-2xl font-extrabold text-slate-900" style={{ fontFamily: 'Poppins, sans-serif' }}>{stat.celkem}</p>
              <p className="text-xs text-slate-500">načtení celkem</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-2xl font-extrabold text-slate-900" style={{ fontFamily: 'Poppins, sans-serif' }}>{stat.tydne}</p>
              <p className="text-xs text-slate-500">za posledních 7 dní</p>
            </div>
          </div>
          {stat.celkem === 0 && (
            <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-800">
              Zatím nikdo. Vytiskněte samolepku a dejte ji na zrcadlo u křesla nebo na vnitřní stranu dveří —
              tam si jí zákazník všimne ve chvíli, kdy přemýšlí, kdy zase přijde.
            </p>
          )}
          <p className="mt-2 text-xs text-slate-400">
            Počítáme jen načtení, ne kdo skenoval. Žádné sledování lidí.
          </p>
        </div>
      )}

      <div className="flex gap-2.5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
        <Eye className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
        <p className="text-xs leading-relaxed text-slate-600">
          <strong className="text-slate-900">Kód se nemění.</strong> Když upravíte ceník nebo termíny,
          vytištěné kódy platí dál — vedou na vaši kartu, ne na její obsah. Vytisknete jednou a máte pokoj.
        </p>
      </div>
    </div>
  )
}