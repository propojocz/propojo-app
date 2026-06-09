// components/ui/ServiceListSkeleton.tsx

export default function ServiceListSkeleton() {
  return (
    <div>
      <div className="mb-6 h-4 w-40 animate-pulse rounded-full bg-slate-200" />
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
            style={{ animationDelay: `${i * 50}ms` }}
          >
            {/* Image skeleton */}
            <div className="h-44 w-full animate-pulse bg-slate-200" />
            {/* Content skeleton */}
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 animate-pulse rounded-full bg-slate-200" />
                <div className="h-3 w-24 animate-pulse rounded bg-slate-200" />
              </div>
              <div className="h-4 w-4/5 animate-pulse rounded bg-slate-200" />
              <div className="h-3 w-full animate-pulse rounded bg-slate-200" />
              <div className="h-3 w-2/3 animate-pulse rounded bg-slate-200" />
              <div className="flex justify-between border-t border-slate-100 pt-3">
                <div className="h-3 w-16 animate-pulse rounded bg-slate-200" />
                <div className="h-5 w-20 animate-pulse rounded bg-slate-200" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
