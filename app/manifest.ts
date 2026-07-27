// app/manifest.ts
// Next.js z tohoto souboru sám vygeneruje /manifest.webmanifest a vloží
// odkaz do <head>. Do layout.tsx se tedy nemusí sahat.
import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Propojo — řemeslníci ve vašem okolí',
    short_name: 'Propojo',
    description:
      'Najděte řemeslníka ve svém okolí, rezervujte termín a plaťte bezpečně přes Propojo.',
    lang: 'cs',
    start_url: '/',
    scope: '/',
    // 'standalone' je podmínka pro push na iPhonu — bez něj se web po přidání
    // na plochu spustí jako obyčejná záložka a notifikace nefungují.
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#10b981',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
