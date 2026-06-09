// app/marketplace/loading.tsx
// Next.js Streaming Loading UI

import ServiceListSkeleton from '@/components/ui/ServiceListSkeleton'

export default function MarketplaceLoading() {
  return (
    <main className="min-h-screen bg-slate-50">
      {/* Header skeleton */}
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="space-y-3">
            <div className="h-3 w-32 animate-pulse rounded-full bg-slate-200" />
            <div className="h-9 w-72 animate-pulse rounded-xl bg-slate-200" />
            <div className="h-4 w-56 animate-pulse rounded-full bg-slate-200" />
          </div>
        </div>
      </div>

      {/* Kategorie skeleton */}
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex gap-2 py-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-8 w-20 shrink-0 animate-pulse rounded-full bg-slate-200"
                style={{ animationDelay: `${i * 80}ms` }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Cards skeleton */}
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <ServiceListSkeleton />
      </div>
    </main>
  )
}
