'use client'
// components/ui/PrintTemplates.tsx
// Čtyři hotové šablony s QR kódem. Vybere se jedna a vytiskne —
// v okně tisku jde zvolit i „Uložit jako PDF", takže nepotřebujeme
// žádnou knihovnu na generování PDF.

import { useState, useEffect, useRef, useCallback } from 'react'
import { Printer, Loader2 } from 'lucide-react'

declare global {
  interface Window { qrcode?: any }
}

type Sablona = 'vizitka' | 'samolepka' | 'stojanek' | 'plakat'

const SABLONY: Array<{ id: Sablona; nazev: string; popis: string }> = [
  { id: 'vizitka',   nazev: 'Vizitka',          popis: '90 × 50 mm — do peněženky' },
  { id: 'samolepka', nazev: 'Samolepka',        popis: 'Ø 60 mm — na zrcadlo, dveře' },
  { id: 'stojanek',  nazev: 'Stojánek na pult', popis: 'A6 — složí se do stříšky' },
  { id: 'plakat',    nazev: 'Plakát',           popis: 'A4 — na dveře, výlohu' },
]

export default function PrintTemplates({
  url, jmeno, mesto,
}: {
  url: string
  jmeno: string
  mesto: string | null
}) {
  const [sablona, setSablona] = useState<Sablona>('samolepka')
  const [ready, setReady] = useState(false)
  const qrRefs = useRef<Record<string, HTMLDivElement | null>>({})

  useEffect(() => {
    if (window.qrcode) { setReady(true); return }
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js'
    s.onload = () => setReady(true)
    document.body.appendChild(s)
  }, [])

  const kresli = useCallback(() => {
    if (!ready || !window.qrcode) return
    Object.keys(qrRefs.current).forEach(klic => {
      const el = qrRefs.current[klic]
      if (!el) return
      const qr = window.qrcode(0, 'M')
      qr.addData(url)
      qr.make()
      el.innerHTML = qr.createImgTag(12, 0)
      const img = el.querySelector('img')
      if (img) {
        img.style.width = '100%'
        img.style.height = '100%'
        img.style.imageRendering = 'pixelated'
        img.style.display = 'block'
      }
    })
  }, [ready, url])

  useEffect(() => { kresli() }, [kresli, sablona])

  const setRef = (k: string) => (el: HTMLDivElement | null) => { qrRefs.current[k] = el }

  return (
    <div>
      {/* Výběr šablony — netiskne se */}
      <div className="print:hidden">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
          Šablony k tisku
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Vyberte jednu a dejte Tisknout. V okně tisku můžete místo tiskárny zvolit „Uložit jako PDF".
        </p>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {SABLONY.map(s => (
            <button
              key={s.id}
              onClick={() => setSablona(s.id)}
              className={`rounded-xl border-2 p-3 text-left transition ${
                sablona === s.id ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-white hover:border-emerald-200'
              }`}
            >
              <span className="block text-sm font-bold text-slate-900">{s.nazev}</span>
              <span className="block text-[11px] leading-snug text-slate-500">{s.popis}</span>
            </button>
          ))}
        </div>

        <button
          onClick={() => window.print()}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-600"
        >
          <Printer className="h-4 w-4" /> Tisknout / uložit PDF
        </button>

        <p className="mt-2 rounded-xl bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-500">
          V okně tisku vypněte „záhlaví a zápatí" a nastavte měřítko na 100 %, aby rozměry seděly.
          Samolepku vytisknete na samolepicí papír z papírnictví.
        </p>

        {!ready && (
          <p className="mt-3 flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Připravuji kód…
          </p>
        )}
      </div>

      {/* NÁHLED + TISK */}
      <div className="mt-6 flex justify-center rounded-2xl bg-slate-100 p-6 print:mt-0 print:bg-white print:p-0">

        {sablona === 'vizitka' && (
          <div className="tpl vizitka">
            <div className="v-qr" ref={setRef('vizitka')} />
            <div className="v-txt">
              <p className="v-jmeno">{jmeno}</p>
              {mesto && <p className="v-mesto">{mesto}</p>}
              <p className="v-vyzva">Objednejte se online</p>
              <p className="v-url">{url.replace(/^https?:\/\//, '')}</p>
            </div>
          </div>
        )}

        {sablona === 'samolepka' && (
          <div className="tpl samolepka">
            <p className="s-nadpis">OBJEDNEJTE SE</p>
            <div className="s-qr" ref={setRef('samolepka')} />
            <p className="s-pata">{jmeno}</p>
          </div>
        )}

        {sablona === 'stojanek' && (
          <div className="tpl stojanek">
            <p className="st-nadpis">Objednejte se na příště</p>
            <div className="st-qr" ref={setRef('stojanek')} />
            <p className="st-text">Namiřte foťák na kód</p>
            <p className="st-jmeno">{jmeno}</p>
          </div>
        )}

        {sablona === 'plakat' && (
          <div className="tpl plakat">
            <p className="p-nadpis">OBJEDNEJTE SE ONLINE</p>
            <p className="p-podnadpis">Vyberte si termín, který vám sedí</p>
            <div className="p-qr" ref={setRef('plakat')} />
            <p className="p-text">Namiřte foťák telefonu na kód</p>
            <p className="p-jmeno">{jmeno}</p>
            {mesto && <p className="p-mesto">{mesto}</p>}
            <p className="p-url">{url.replace(/^https?:\/\//, '')}</p>
          </div>
        )}
      </div>

      <style jsx global>{`
        .tpl {
          background: #fff;
          box-sizing: border-box;
          font-family: 'DM Sans', system-ui, sans-serif;
          color: #0f172a;
        }

        /* ── VIZITKA 90 × 50 mm ── */
        .vizitka {
          width: 90mm; height: 50mm;
          display: flex; align-items: center; gap: 5mm;
          padding: 5mm; border: 1px solid #e2e8f0; border-radius: 2mm;
        }
        .vizitka .v-qr { width: 32mm; height: 32mm; flex-shrink: 0; }
        .vizitka .v-txt { min-width: 0; }
        .v-jmeno { font-family: Poppins, sans-serif; font-size: 12pt; font-weight: 800; line-height: 1.15; }
        .v-mesto { font-size: 8pt; color: #64748b; margin-top: 0.5mm; }
        .v-vyzva { font-size: 9pt; font-weight: 700; color: #059669; margin-top: 3mm; }
        .v-url { font-size: 7.5pt; color: #94a3b8; margin-top: 1mm; word-break: break-all; }

        /* ── SAMOLEPKA Ø 60 mm ── */
        .samolepka {
          width: 60mm; height: 60mm; border-radius: 50%;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 1.5mm; padding: 6mm; border: 1px solid #e2e8f0; text-align: center;
        }
        .s-nadpis { font-family: Poppins, sans-serif; font-size: 7.5pt; font-weight: 800; letter-spacing: 0.05em; color: #047857; }
        .samolepka .s-qr { width: 30mm; height: 30mm; }
        .s-pata { font-size: 7pt; font-weight: 700; max-width: 44mm; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        /* ── STOJÁNEK A6 105 × 148 mm ── */
        .stojanek {
          width: 105mm; height: 148mm;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 4mm; padding: 12mm 8mm; border: 1px solid #e2e8f0; border-radius: 2mm; text-align: center;
        }
        .st-nadpis { font-family: Poppins, sans-serif; font-size: 15pt; font-weight: 800; line-height: 1.2; }
        .stojanek .st-qr { width: 55mm; height: 55mm; }
        .st-text { font-size: 9pt; color: #64748b; }
        .st-jmeno { font-family: Poppins, sans-serif; font-size: 11pt; font-weight: 700; margin-top: 2mm; }

        /* ── PLAKÁT A4 210 × 297 mm ── */
        .plakat {
          width: 210mm; height: 297mm;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 6mm; padding: 25mm 20mm; text-align: center;
        }
        .p-nadpis { font-family: Poppins, sans-serif; font-size: 30pt; font-weight: 800; letter-spacing: -0.02em; line-height: 1.1; }
        .p-podnadpis { font-size: 13pt; color: #64748b; }
        .plakat .p-qr { width: 95mm; height: 95mm; margin: 4mm 0; }
        .p-text { font-size: 12pt; color: #475569; }
        .p-jmeno { font-family: Poppins, sans-serif; font-size: 20pt; font-weight: 800; margin-top: 6mm; }
        .p-mesto { font-size: 12pt; color: #64748b; }
        .p-url { font-size: 10pt; color: #94a3b8; margin-top: 4mm; }

        /* ── TISK ── */
        @media print {
          @page { margin: 8mm; }
          body { background: #fff !important; }
          /* Schováme všechno kolem — tiskne se jen šablona */
          body * { visibility: hidden; }
          .tpl, .tpl * { visibility: visible; }
          .tpl { position: absolute; left: 0; top: 0; border: none !important; }
          .vizitka, .samolepka { border: 1px dashed #cbd5e1 !important; }
        }
      `}</style>
    </div>
  )
}