// components/ui/IncomingHandoffsPanel.tsx
// Server wrapper — načte přihrávky čekající na přihlášeného uživatele
// a předá je klientskému panelu s tlačítky. Vlož kamkoli: <IncomingHandoffsPanel />
import { getIncomingHandoffs } from '@/lib/actions/handoffs'
import IncomingHandoffs from './IncomingHandoffs'

export default async function IncomingHandoffsPanel() {
  const handoffs = await getIncomingHandoffs()
  if (!handoffs || handoffs.length === 0) return null
  return <IncomingHandoffs handoffs={handoffs} />
}