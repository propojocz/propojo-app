// app/admin/obrazky/page.tsx
// Obrázky v sekci „Jak to funguje“ na úvodní stránce (19. 10. 2026). Přístup hlídá admin layout.

import { listHomepageImages } from '@/lib/actions/homepage-images'
import HomepageImagesManager from './HomepageImagesManager'

export const metadata = { title: 'Obrázky | Admin Propojo' }

export default async function AdminObrazkyPage() {
  const images = await listHomepageImages()
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Obrázky na úvodní stránce</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Sekce „Jak to funguje“ – při každém načtení stránky se ukáže náhodně jeden ze zapnutých obrázků.
          Když žádný není, ukáže se barevné pozadí.
        </p>
      </div>
      <HomepageImagesManager images={images} />
    </div>
  )
}
