
// app/profil/[id]/loading.tsx
export default function Loading() {
  return (
    <div className="mx-auto max-w-4xl animate-pulse px-4 py-8 sm:px-6 lg:px-8">
      {/* Hlavička */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
          <div className="h-24 w-24 shrink-0 rounded-full bg-slate-200" />
          <div className="flex-1 space-y-3">
            <div className="h-7 w-48 rounded bg-slate-200" />
            <div className="h-4 w-32 rounded bg-slate-100" />
            <div className="space-y-2 pt-2">
              <div className="h-3 w-full rounded bg-slate-100" />
              <div className="h-3 w-5/6 rounded bg-slate-100" />
              <div className="h-3 w-2/3 rounded bg-slate-100" />
            </div>
          </div>
        </div>
      </div>

      {/* Služby */}
      <div className="mt-8">
        <div className="mb-4 h-6 w-40 rounded bg-slate-200" />
        <div className="grid gap-4 sm:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="h-5 w-3/4 rounded bg-slate-200" />
              <div className="mt-3 h-4 w-1/2 rounded bg-slate-100" />
            </div>
          ))}
        </div>
      </div>

      {/* Recenze */}
      <div className="mt-8">
        <div className="mb-4 h-6 w-28 rounded bg-slate-200" />
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-slate-200" />
                <div className="space-y-2">
                  <div className="h-4 w-32 rounded bg-slate-200" />
                  <div className="h-3 w-24 rounded bg-slate-100" />
                </div>
              </div>
              <div className="mt-3 space-y-2">
                <div className="h-3 w-full rounded bg-slate-100" />
                <div className="h-3 w-4/5 rounded bg-slate-100" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}