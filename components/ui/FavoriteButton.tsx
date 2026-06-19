'use client'
import { useState } from 'react'
import { Heart, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toggleFavorite } from '@/lib/actions/favorites'

export default function FavoriteButton({
  providerId,
  initialFavorited,
  isLoggedIn,
  variant = 'icon',
}: {
  providerId: string
  initialFavorited: boolean
  isLoggedIn: boolean
  variant?: 'icon' | 'full'
}) {
  const router = useRouter()
  const [favorited, setFavorited] = useState(initialFavorited)
  const [loading, setLoading] = useState(false)

  const handleClick = async () => {
    // Nepřihlášený → na login s návratem zpět
    if (!isLoggedIn) {
      router.push(`/prihlasit?next=/profil/${providerId}`)
      return
    }
    if (loading) return
    setLoading(true)
    // Optimistické přepnutí (hned se přebarví, server doběhne na pozadí)
    setFavorited((v) => !v)
    const result = await toggleFavorite(providerId)
    if (!result.success) {
      setFavorited((v) => !v) // vrátit zpět při chybě
    }
    setLoading(false)
  }

  if (variant === 'full') {
    return (
      <button
        onClick={handleClick}
        disabled={loading}
        className={`inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors ${
          favorited
            ? 'border-rose-200 bg-rose-50 text-rose-600'
            : 'border-slate-200 bg-white text-slate-600 hover:border-rose-200 hover:text-rose-600'
        }`}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Heart className="h-4 w-4" fill={favorited ? 'currentColor' : 'none'} />}
        {favorited ? 'V oblíbených' : 'Přidat do oblíbených'}
      </button>
    )
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      title={favorited ? 'Odebrat z oblíbených' : 'Přidat do oblíbených'}
      className={`flex h-10 w-10 items-center justify-center rounded-full border bg-white/90 backdrop-blur-sm transition-colors ${
        favorited ? 'border-rose-200 text-rose-500' : 'border-slate-200 text-slate-400 hover:text-rose-500'
      }`}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Heart className="h-5 w-5" fill={favorited ? 'currentColor' : 'none'} />}
    </button>
  )
}