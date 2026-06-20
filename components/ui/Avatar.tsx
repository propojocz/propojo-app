// components/ui/Avatar.tsx
// Univerzální avatar: když má uživatel fotku, ukáže ji; jinak iniciálu jména.
// Použití: <Avatar name={jmeno} url={avatarUrl} size={44} />

interface AvatarProps {
  name?: string | null
  url?: string | null
  size?: number          // velikost v px (default 44)
  className?: string     // doplňkové třídy (např. barvy pozadí)
}

function initial(name?: string | null): string {
  if (!name) return '?'
  return name.trim().charAt(0).toUpperCase() || '?'
}

export default function Avatar({ name, url, size = 44, className = '' }: AvatarProps) {
  const px = `${size}px`
  // velikost písma zhruba 40 % průměru
  const fontSize = `${Math.round(size * 0.4)}px`

  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-emerald-100 font-black text-emerald-700 ${className}`}
      style={{ width: px, height: px, fontSize }}
    >
      {url ? (
        <img src={url} alt={name ?? ''} className="h-full w-full rounded-full object-cover" />
      ) : (
        initial(name)
      )}
    </div>
  )
}