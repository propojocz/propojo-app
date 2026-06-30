'use client'
// components/ui/ChatThread.tsx
// Sdílené BUBLINOVÉ zobrazení konverzace (WhatsApp styl). Použito v chatu objednávky
// i v admin detailu sporu, aby vypadaly stejně.
// - svoje zprávy: zelená, vpravo, bez jména
// - cizí: šedá, vlevo, jméno nad bublinou
// - Propojo (is_admin): modrá, vystředěná, "🛡 Propojo"
// - fotky (image_url) nad textem
import { ShieldCheck } from 'lucide-react'

export type ChatMessage = {
  id: string
  sender_id: string
  content: string | null
  created_at: string
  image_url?: string | null
  is_admin?: boolean | null
}

export default function ChatThread({
  messages,
  myUserId,
  senderNames,
}: {
  messages: ChatMessage[]
  myUserId: string | null   // null = admin pohled (nikdo není "já", vše má jméno)
  senderNames: Record<string, string>
}) {
  const fmtTime = (iso: string) =>
    new Intl.DateTimeFormat('cs-CZ', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso))

  if (!messages || messages.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-400">Zatím žádné zprávy.</p>
  }

  return (
    <div className="space-y-3">
      {messages.map((m) => {
        const isPropojo = m.is_admin === true
        const mine = !isPropojo && myUserId !== null && m.sender_id === myUserId

        if (isPropojo) {
          return (
            <div key={m.id} className="flex flex-col items-center">
              <span className="mb-0.5 flex items-center gap-1 px-1 text-[11px] font-semibold text-blue-600">
                <ShieldCheck className="h-3 w-3" /> Propojo
              </span>
              <div className="max-w-[85%] rounded-2xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-900">
                {m.image_url && (
                  <a href={m.image_url} target="_blank" rel="noopener noreferrer" className="block">
                    <img src={m.image_url} alt="Příloha" className="mb-1.5 max-h-60 w-full rounded-lg object-cover" />
                  </a>
                )}
                {m.content && <p className="whitespace-pre-wrap break-words">{m.content}</p>}
                <p className="mt-1 text-[11px] text-blue-400">{fmtTime(m.created_at)}</p>
              </div>
            </div>
          )
        }

        return (
          <div key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
            {!mine && (
              <span className="mb-0.5 px-1 text-[11px] font-semibold text-slate-500">
                {senderNames[m.sender_id] ?? 'Uživatel'}
              </span>
            )}
            <div className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${mine ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-800'}`}>
              {m.image_url && (
                <a href={m.image_url} target="_blank" rel="noopener noreferrer" className="block">
                  <img src={m.image_url} alt="Příloha" className="mb-1.5 max-h-60 w-full rounded-lg object-cover" />
                </a>
              )}
              {m.content && <p className="whitespace-pre-wrap break-words">{m.content}</p>}
              <p className={`mt-1 text-[11px] ${mine ? 'text-emerald-100' : 'text-slate-400'}`}>{fmtTime(m.created_at)}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}