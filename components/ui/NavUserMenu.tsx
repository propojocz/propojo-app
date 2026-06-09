'use client'
// components/ui/NavUserMenu.tsx

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { LogOut, User, LayoutDashboard, ChevronDown } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface NavUserMenuProps {
  name: string
  avatarUrl: string | null
  userId: string
}

export default function NavUserMenu({ name, avatarUrl, userId }: NavUserMenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  return (
    <div ref={ref} className="relative ml-1">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-700 transition-all hover:border-slate-300 hover:bg-slate-50"
      >
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
          {name.charAt(0).toUpperCase()}
        </div>
        <span className="hidden max-w-[100px] truncate sm:block">{name.split(' ')[0]}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-1.5 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
          >
            {/* Profil info */}
            <div className="border-b border-slate-100 px-4 py-3">
              <p className="text-xs text-slate-400">Přihlášen jako</p>
              <p className="truncate text-sm font-bold text-slate-800">{name}</p>
            </div>

            {/* Menu položky */}
            <a href="/dashboard" className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
              <LayoutDashboard className="h-4 w-4 text-slate-400" />
              Dashboard
            </a>
            <a href={`/profil/${userId}`} className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
              <User className="h-4 w-4 text-slate-400" />
              Veřejný profil
            </a>

            {/* Odhlášení */}
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-2.5 border-t border-slate-100 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50"
            >
              <LogOut className="h-4 w-4" />
              Odhlásit se
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
