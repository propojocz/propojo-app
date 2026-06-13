// middleware.ts  (PATŘÍ DO KOŘENE PROJEKTU, vedle package.json – NE do app/)
// Režim údržby: schová celý web návštěvníkům, tebe pustí přes tajný odkaz.
//
// JAK TĚ PUSTIT DOVNITŘ:
//   Jednou navštiv:  https://propojo.cz/?klic=pusti-me-dovnitr
//   Tím se ti uloží cookie a web pak vidíš normálně (i po zavření).
//
// JAK ZRUŠIT ÚDRŽBU (spuštění naživo):
//   Změň MAINTENANCE na false (níže) a pushni. Hotovo.
 
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
 
// ── PŘEPÍNAČ ÚDRŽBY ────────────────────────────────────────
const MAINTENANCE = true              // true = web schovaný, false = web naživo
const SECRET = 'pusti-me-dovnitr'     // tajné heslo v odkazu ?klic=...
const COOKIE = 'propojo_pass'         // jméno cookie, co tě pustí
// ───────────────────────────────────────────────────────────
 
export function middleware(req: NextRequest) {
  // Údržba vypnutá → web jede normálně
  if (!MAINTENANCE) return NextResponse.next()
 
  const { searchParams, pathname } = req.nextUrl
 
  // 1) Přišel jsi s tajným klíčem v URL? → ulož cookie a pusť dál
  if (searchParams.get('klic') === SECRET) {
    const res = NextResponse.redirect(new URL(pathname, req.url))
    res.cookies.set(COOKIE, SECRET, {
      maxAge: 60 * 60 * 24 * 30, // 30 dní
      path: '/',
    })
    return res
  }
 
  // 2) Máš už uloženou cookie? → pusť dál
  if (req.cookies.get(COOKIE)?.value === SECRET) {
    return NextResponse.next()
  }
 
  // 3) Jinak → ukaž stránku údržby
  const html = `<!doctype html>
<html lang="cs"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Propojo.cz – připravujeme</title>
<style>
  body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
    background:#f8fafc;color:#0f172a;display:flex;min-height:100vh;
    align-items:center;justify-content:center;text-align:center;padding:24px}
  .box{max-width:460px}
  .logo{font-size:28px;font-weight:800;color:#10b981;margin-bottom:16px}
  h1{font-size:22px;margin:0 0 8px}
  p{color:#64748b;line-height:1.5;margin:0}
</style></head>
<body><div class="box">
  <div class="logo">propojo.cz</div>
  <h1>🚧 Připravujeme něco dobrého</h1>
  <p>Spojíme tě s ověřenými řemeslníky ve tvém okolí. Web spustíme už brzy.</p>
</div></body></html>`
 
  return new NextResponse(html, {
    status: 503,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  })
}
 
// Na co se middleware vztahuje: na všechno KROMĚ statických souborů a obrázků
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)).*)'],
}