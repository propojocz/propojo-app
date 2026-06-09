'use client'
// app/dashboard/objednavky/[id]/OrderDetailClient.tsx

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CATEGORY_META } from '@/types/database'
import { MapPin, Send, Loader2, CheckCircle2, XCircle, PlayCircle, Star, ImageIcon } from 'lucide-react'
import { updateOrderStatus } from '@/lib/actions/orders'
import ReviewForm from '@/components/ui/ReviewForm'

const STATUS_LABELS: Record<string, string> = {
  cekajici: 'Čeká na přijetí', prijato: 'Přijato', v_procesu: 'V procesu', dokonceno: 'Dokončeno', zruseno: 'Zrušeno',
}
const STATUS_COLORS: Record<string, string> = {
  cekajici: 'bg-amber-100 text-amber-700',
  prijato: 'bg-blue-100 text-blue-700',
  v_procesu: 'bg-indigo-100 text-indigo-700',
  dokonceno: 'bg-emerald-100 text-emerald-700',
  zruseno: 'bg-red-100 text-red-700',
}
const STATUS_TIMELINE = ['cekajici', 'prijato', 'v_procesu', 'dokonceno']

interface Message {
  id: string
  order_id: string
  sender_id: string
  content: string
  image_url?: string | null
  created_at: string
}

interface Props {
  order: any
  myProfile: any
  otherProfile: any
  initialMessages: Message[]
  isProvider: boolean
  userId: string
}

export default function OrderDetailClient({ order, myProfile, otherProfile, initialMessages, isProvider, userId }: Props) {
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState(order.status)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [showReview, setShowReview] = useState(false)
  const [reviewed, setReviewed] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  // Scroll na konec při nových zprávách
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`order-chat-${order.id}`, {
        config: { broadcast: { self: true } }
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `order_id=eq.${order.id}`,
      }, (payload) => {
        const newMsg = payload.new as Message
        setMessages(prev => {
          // Zabráň duplikátům
          if (prev.find(m => m.id === newMsg.id)) return prev
          return [...prev, newMsg]
        })
      })
      .subscribe((status) => {
        console.log('[Realtime] status:', status)
      })

    return () => { supabase.removeChannel(channel) }
  }, [order.id])

  const uploadImage = async (file: File) => {
    if (!file.type.startsWith('image/')) return
    if (file.size > 10 * 1024 * 1024) { alert('Obrázek je příliš velký. Max 10 MB.'); return }
    
    setUploading(true)
    const ext = file.name.split('.').pop()
    const path = `${userId}/chat/${order.id}/${Date.now()}.${ext}`
    
    const { data, error } = await supabase.storage.from('images').upload(path, file, { contentType: file.type })
    
    if (error) { console.error('Upload error:', error); setUploading(false); return }
    
    const { data: { publicUrl } } = supabase.storage.from('images').getPublicUrl(data.path)
    
    // Pošli zprávu s obrázkem
    const tempMsg: Message = {
      id: `temp-${Date.now()}`,
      order_id: order.id,
      sender_id: userId,
      content: '',
      image_url: publicUrl,
      created_at: new Date().toISOString(),
    }
    setMessages(prev => [...prev, tempMsg])
    
    const { data: msgData, error: msgError } = await supabase.from('messages').insert({
      order_id: order.id,
      sender_id: userId,
      content: '',
      image_url: publicUrl,
    }).select().single()
    
    if (msgError) {
      setMessages(prev => prev.filter(m => m.id !== tempMsg.id))
    } else if (msgData) {
      setMessages(prev => prev.map(m => m.id === tempMsg.id ? msgData : m))
    }
    setUploading(false)
  }

  const sendMessage = async () => {
    const text = input.trim()
    if (!text || sending) return

    setSending(true)
    setInput('')
    
    // Optimistic update - zobraz zprávu okamžitě
    const tempMsg: Message = {
      id: `temp-${Date.now()}`,
      order_id: order.id,
      sender_id: userId,
      content: text,
      created_at: new Date().toISOString(),
    }
    setMessages(prev => [...prev, tempMsg])

    const { data, error } = await supabase.from('messages').insert({
      order_id: order.id,
      sender_id: userId,
      content: text,
    }).select().single()

    if (error) {
      // Rollback při chybě
      setMessages(prev => prev.filter(m => m.id !== tempMsg.id))
      setInput(text)
    } else if (data) {
      // Nahraď temp zprávu skutečnou
      setMessages(prev => prev.map(m => m.id === tempMsg.id ? data : m))
    }
    setSending(false)
  }

  const handleStatusUpdate = async (newStatus: string) => {
    setUpdatingStatus(true)
    const result = await updateOrderStatus(order.id, newStatus as any)
    if (result.success) setStatus(newStatus)
    setUpdatingStatus(false)
  }

  const currentStep = STATUS_TIMELINE.indexOf(status)
  const meta = CATEGORY_META[order.services?.category as keyof typeof CATEGORY_META]

  const NEXT_ACTIONS: Record<string, { status: string; label: string; icon: any; color: string }[]> = {
    cekajici: [
      { status: 'prijato', label: 'Přijmout', icon: CheckCircle2, color: 'text-emerald-600 border-emerald-200 hover:bg-emerald-50' },
      { status: 'zruseno', label: 'Odmítnout', icon: XCircle, color: 'text-red-600 border-red-200 hover:bg-red-50' },
    ],
    prijato: [
      { status: 'v_procesu', label: 'Zahájit práci', icon: PlayCircle, color: 'text-indigo-600 border-indigo-200 hover:bg-indigo-50' },
      { status: 'zruseno', label: 'Zrušit', icon: XCircle, color: 'text-red-600 border-red-200 hover:bg-red-50' },
    ],
    v_procesu: [
      { status: 'dokonceno', label: 'Označit jako hotovo', icon: CheckCircle2, color: 'text-emerald-600 border-emerald-200 hover:bg-emerald-50' },
    ],
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">

      {/* Levý sloupec – info */}
      <div className="space-y-4">

        {/* Info o objednávce */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-2xl">{meta?.emoji ?? '📦'}</span>
            <div>
              <h2 className="font-bold text-slate-900">{order.services?.title}</h2>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[status]}`}>
                {STATUS_LABELS[status]}
              </span>
            </div>
          </div>
          <div className="space-y-1.5 text-sm text-slate-600">
            <p>💰 <strong>{order.services?.price?.toLocaleString('cs-CZ')} Kč</strong>/{order.services?.price_unit}</p>
            {order.services?.city && <p><MapPin className="inline h-3.5 w-3.5 mr-1" />{order.services.city}</p>}
            <p>📅 {new Intl.DateTimeFormat('cs-CZ', { dateStyle: 'long' }).format(new Date(order.created_at))}</p>
          </div>
          {order.message && (
            <div className="mt-3 rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-sm text-slate-600">
              💬 {order.message}
            </div>
          )}
        </div>

        {/* Timeline statusů */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-bold text-slate-700">Průběh zakázky</h3>
          <div className="space-y-2">
            {STATUS_TIMELINE.map((s, i) => {
              const isDone = i < currentStep || status === 'dokonceno'
              const isCurrent = s === status
              const isCancelled = status === 'zruseno'
              return (
                <div key={s} className="flex items-center gap-2.5">
                  <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    isCancelled && isCurrent ? 'bg-red-100 text-red-600' :
                    isDone || isCurrent ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'
                  }`}>
                    {isDone && !isCurrent ? '✓' : i + 1}
                  </div>
                  <span className={`text-sm ${isCurrent ? 'font-semibold text-slate-900' : isDone ? 'text-slate-600' : 'text-slate-400'}`}>
                    {STATUS_LABELS[s]}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Profil druhé strany */}
        {otherProfile && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-bold text-slate-700">{isProvider ? 'Zákazník' : 'Živnostník'}</h3>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-sm font-black text-indigo-700">
                {otherProfile.full_name?.charAt(0)?.toUpperCase()}
              </div>
              <div>
                <p className="font-semibold text-slate-900">{otherProfile.full_name}</p>
                {otherProfile.city && <p className="text-xs text-slate-500">{otherProfile.city}</p>}
                {otherProfile.phone && <p className="text-xs text-slate-500">{otherProfile.phone}</p>}
              </div>
            </div>
          </div>
        )}

        {/* Akce pro živnostníka */}
        {isProvider && NEXT_ACTIONS[status] && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-2">
            <h3 className="text-sm font-bold text-slate-700 mb-3">Změnit stav</h3>
            {NEXT_ACTIONS[status].map(action => (
              <button
                key={action.status}
                onClick={() => handleStatusUpdate(action.status)}
                disabled={updatingStatus}
                className={`flex w-full items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-all ${action.color}`}
              >
                {updatingStatus ? <Loader2 className="h-4 w-4 animate-spin" /> : <action.icon className="h-4 w-4" />}
                {action.label}
              </button>
            ))}
          </div>
        )}

        {/* Recenze pro zákazníka */}
        {!isProvider && status === 'dokonceno' && !reviewed && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            {showReview ? (
              <ReviewForm
                orderId={order.id}
                providerId={order.provider_id}
                providerName={otherProfile?.full_name ?? 'Živnostník'}
                serviceTitle={order.services?.title ?? 'Služba'}
                onSuccess={() => { setReviewed(true); setShowReview(false) }}
              />
            ) : (
              <div className="text-center">
                <Star className="h-8 w-8 text-amber-500 mx-auto mb-2" />
                <p className="text-sm font-semibold text-amber-800 mb-3">Zakázka dokončena! Ohodnoťte živnostníka.</p>
                <button onClick={() => setShowReview(true)} className="btn-primary text-sm w-full">
                  Napsat recenzi
                </button>
              </div>
            )}
          </div>
        )}

        {reviewed && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-center text-sm text-emerald-700">
            ⭐ Díky za hodnocení!
          </div>
        )}
      </div>

      {/* Pravý sloupec – chat */}
      <div className="lg:col-span-2 flex flex-col rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden" style={{ height: 'calc(100vh - 200px)', minHeight: '500px' }}>
        {/* Chat header */}
        <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 text-sm font-black text-indigo-700">
            {otherProfile?.full_name?.charAt(0)?.toUpperCase() ?? '?'}
          </div>
          <div>
            <p className="font-bold text-slate-900">{otherProfile?.full_name ?? (isProvider ? 'Zákazník' : 'Živnostník')}</p>
            <p className="text-xs text-slate-400">{isProvider ? 'Zákazník' : 'Živnostník'} · {order.services?.title}</p>
          </div>
        </div>

        {/* Zprávy */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {messages.length === 0 && (
            <div className="flex h-full items-center justify-center text-center">
              <div>
                <div className="mb-2 text-4xl">💬</div>
                <p className="text-sm text-slate-400">Zatím žádné zprávy.<br />Začněte konverzaci.</p>
              </div>
            </div>
          )}
          {messages.map(msg => {
            const isMe = msg.sender_id === userId
            return (
              <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${
                  isMe
                    ? 'bg-indigo-600 text-white rounded-br-sm'
                    : 'bg-slate-100 text-slate-800 rounded-bl-sm'
                }`}>
                  <p className="leading-relaxed">{msg.content}</p>
                  <p className={`mt-1 text-[10px] ${isMe ? 'text-indigo-200' : 'text-slate-400'}`}>
                    {new Intl.DateTimeFormat('cs-CZ', { hour: '2-digit', minute: '2-digit' }).format(new Date(msg.created_at))}
                  </p>
                </div>
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="border-t border-slate-100 px-4 py-3">
          <div className="flex items-end gap-2">
            {/* Fotka tlačítko */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-100 transition-colors disabled:opacity-40"
              title="Přiložit fotku"
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(f); e.target.value = '' }}
            />

            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
              }}
              placeholder="Napište zprávu… (Enter = odeslat)"
              rows={1}
              className="flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:bg-white transition-colors"
              style={{ maxHeight: '120px', overflowY: 'auto' }}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || sending}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white transition-all hover:bg-indigo-700 disabled:opacity-40"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-1.5 text-[10px] text-slate-400 text-center">Shift+Enter = nový řádek · 📷 = přiložit fotku</p>
        </div>
      </div>
    </div>
  )
}
