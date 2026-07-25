'use client'
import { useEffect, useState } from 'react'
import { savePushSubscription, deletePushSubscription } from '@/lib/actions/push'

type Stav = 'zjistuje' | 'nepodporovano' | 'vypnuto' | 'zapnuto' | 'blokovano' | 'pracuje'

// Převod VAPID klíče z base64url do formátu, který čeká PushManager.
function base64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(normalized)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export default function PushPrompt() {
  const [stav, setStav] = useState<Stav>('zjistuje')
  const [chyba, setChyba] = useState<string | null>(null)

  const klic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

  useEffect(() => {
    let zruseno = false

    async function zjistit() {
      if (
        typeof window === 'undefined' ||
        !('serviceWorker' in navigator) ||
        !('PushManager' in window) ||
        !('Notification' in window) ||
        !klic
      ) {
        if (!zruseno) setStav('nepodporovano')
        return
      }

      if (Notification.permission === 'denied') {
        if (!zruseno) setStav('blokovano')
        return
      }

      try {
        const reg = await navigator.serviceWorker.register('/sw.js')
        const existujici = await reg.pushManager.getSubscription()
        if (!zruseno) setStav(existujici ? 'zapnuto' : 'vypnuto')
      } catch {
        if (!zruseno) setStav('nepodporovano')
      }
    }

    zjistit()
    return () => {
      zruseno = true
    }
  }, [klic])

  async function zapnout() {
    if (!klic) return
    setChyba(null)
    setStav('pracuje')
    try {
      const povoleni = await Notification.requestPermission()
      if (povoleni !== 'granted') {
        setStav(povoleni === 'denied' ? 'blokovano' : 'vypnuto')
        return
      }

      const reg = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64ToUint8Array(klic) as BufferSource,
      })

      const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        throw new Error('Neúplný odběr.')
      }

      const res = await savePushSubscription(
        { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } },
        navigator.userAgent
      )

      if (!res.success) {
        setChyba(res.error ?? 'Nepodařilo se zapnout upozornění.')
        setStav('vypnuto')
        return
      }
      setStav('zapnuto')
    } catch (err) {
      console.error('[PushPrompt] zapnutí:', err)
      setChyba('Upozornění se nepodařilo zapnout.')
      setStav('vypnuto')
    }
  }

  async function vypnout() {
    setChyba(null)
    setStav('pracuje')
    try {
      const reg = await navigator.serviceWorker.getRegistration()
      const sub = await reg?.pushManager.getSubscription()
      if (sub) {
        await deletePushSubscription(sub.endpoint)
        await sub.unsubscribe()
      }
      setStav('vypnuto')
    } catch (err) {
      console.error('[PushPrompt] vypnutí:', err)
      setChyba('Upozornění se nepodařilo vypnout.')
      setStav('zapnuto')
    }
  }

  if (stav === 'zjistuje' || stav === 'nepodporovano') return null

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-medium text-slate-900">Upozornění do telefonu</p>
          <p className="mt-1 text-sm text-slate-600">
            {stav === 'zapnuto'
              ? 'Upozornění na nové objednávky a zprávy jsou zapnutá.'
              : stav === 'blokovano'
                ? 'Upozornění máte zablokovaná v nastavení prohlížeče. Povolte je prosím v nastavení webu.'
                : 'Dáme vám vědět o nových objednávkách a zprávách, i když nemáte Propojo otevřené.'}
          </p>
          {chyba && <p className="mt-1 text-sm text-red-600">{chyba}</p>}
        </div>

        {stav !== 'blokovano' && (
          <button
            type="button"
            onClick={stav === 'zapnuto' ? vypnout : zapnout}
            disabled={stav === 'pracuje'}
            className={
              stav === 'zapnuto'
                ? 'shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50'
                : 'shrink-0 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50'
            }
          >
            {stav === 'pracuje' ? 'Pracuji…' : stav === 'zapnuto' ? 'Vypnout' : 'Zapnout'}
          </button>
        )}
      </div>
    </div>
  )
}