// app/admin/uzivatele/page.tsx
import { getUsers } from '@/lib/actions/admin'
import UserRow from './UserRow'
import SearchBox from './SearchBox'

interface Props { searchParams: { q?: string } }

export default async function AdminUzivatelePage({ searchParams }: Props) {
  const q = searchParams.q ?? ''
  const users = await getUsers(q)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Uživatelé</h1>
        <p className="mt-0.5 text-sm text-slate-500">Správa uživatelů a moderace profilů.</p>
      </div>

      <SearchBox initial={q} />

      {users.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white p-12 text-center text-sm text-slate-500">
          Žádní uživatelé.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {users.map((u) => (
            <UserRow key={u.id} user={u} />
          ))}
        </div>
      )}
    </div>
  )
}