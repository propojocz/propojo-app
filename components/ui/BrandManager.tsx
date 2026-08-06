'use client'
// components/ui/BrandManager.tsx
// Správa značky pro poskytovatele: založení, členové, pozvánky, žádosti.
// Dostává předem načtená data ze serveru (getMyBrands + getBrand pro aktivní).

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Building2, UserPlus, Check, X, Loader2, Crown, LogOut, Pencil, Users,
} from 'lucide-react'
import {
  createBrand, updateBrand, inviteMember, respondMembership, removeMember, searchProviders,
} from '@/lib/actions/brands'
import type { BrandDetail, BrandMember } from '@/lib/actions/brands'

type MyBrand = { id: string; name: string; slug: string; role: string; status: string }

export default function BrandManager({
  myBrands, activeBrand, currentUserId,
}: {
  myBrands: MyBrand[]
  activeBrand: BrandDetail | null
  currentUserId: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  // Nová značka
  const [name, setName] = useState('')
  const [city, setCity] = useState('')
  const [bio, setBio] = useState('')

  const isOwner = activeBrand?.owner_id === currentUserId

  // Pozvání člena
  const [hledani, setHledani] = useState('')
  const [vysledky, setVysledky] = useState<Array<{ id: string; name: string; city: string | null }>>([])
  const [hledam, setHledam] = useState(false)

  const handleSearch = async (q: string) => {
    setHledani(q)
    if (q.trim().length < 2) { setVysledky([]); return }
    setHledam(true)
    const res = await searchProviders(q)
    setVysledky(res)
    setHledam(false)
  }

  const handleInvite = async (providerId: string) => {
    if (!activeBrand) return
    setBusy(providerId); setErr(null)
    const res = await inviteMember(activeBrand.id, providerId)
    setBusy(null)
    if (res.success) { setHledani(''); setVysledky([]); router.refresh() }
    else setErr(res.error)
  }

  const handleCreate = async () => {
    if (name.trim().length < 2) { setErr('Zadejte název značky.'); return }
    setBusy('create'); setErr(null)
    const res = await createBrand({ name, city: city || null, bio: bio || null })
    setBusy(null)
    if (res.success) { setShowCreate(false); setName(''); setCity(''); setBio(''); router.refresh() }
    else setErr(res.error)
  }

  const handleRespond = async (memberId: string, accept: boolean) => {
    setBusy(memberId); setErr(null)
    const res = await respondMembership(memberId, accept)
    setBusy(null)
    if (res.success) router.refresh(); else setErr(res.error)
  }

  const handleRemove = async (memberId: string, jmeno: string) => {
    if (!confirm(`Opravdu odebrat ${jmeno} ze značky?`)) return
    setBusy(memberId); setErr(null)
    const res = await removeMember(memberId)
    setBusy(null)
    if (res.success) router.refresh(); else setErr(res.error)
  }

  const memberName = (m: BrandMember) =>
    m.company_name || m.full_name || 'Poskytovatel'

  // ── Žádné značky → nabídka založit ─────────────────────────────
  if (myBrands.length === 0 && !showCreate) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-emerald-50">
          <Building2 className="h-7 w-7 text-emerald-600" />
        </div>
        <h2 className="text-lg font-bold tracking-tight text-slate-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
          Máte salon nebo firmu?
        </h2>
        <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-slate-500">
          Založte značku a spojte pod jedním jménem víc lidí. Každý má dál svou kartu,
          svůj ceník i kalendář — značka jen sdílí jméno, adresu a fotky provozovny.
        </p>
        <button
          onClick={() => setShowCreate(true)}
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600"
        >
          <Building2 className="h-4 w-4" /> Založit značku
        </button>
      </div>
    )
  }

  // ── Formulář založení ──────────────────────────────────────────
  if (showCreate) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-bold tracking-tight" style={{ fontFamily: 'Poppins, sans-serif' }}>Nová značka</h2>
        <p className="mb-4 mt-0.5 text-sm text-slate-500">Základní údaje. Členy pozvete potom.</p>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">Název značky</label>
            <input value={name} onChange={e => setName(e.target.value)} maxLength={80}
              placeholder="Salon Bella · Stavební firma Novák"
              className="block w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">Město</label>
            <input value={city} onChange={e => setCity(e.target.value)} maxLength={80}
              placeholder="Rožnov pod Radhoštěm"
              className="block w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">Krátký popis <span className="font-normal text-slate-400">(nepovinné)</span></label>
            <textarea value={bio} onChange={e => setBio(e.target.value)} maxLength={1000} rows={3}
              placeholder="Čím se značka vyznačuje."
              className="block w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100" />
          </div>
        </div>

        {err && <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}

        <div className="mt-5 flex gap-2">
          <button onClick={() => { setShowCreate(false); setErr(null) }}
            className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
            Zpět
          </button>
          <button onClick={handleCreate} disabled={busy === 'create'}
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-60">
            {busy === 'create' ? <><Loader2 className="h-4 w-4 animate-spin" /> Zakládám…</> : 'Založit značku'}
          </button>
        </div>
      </div>
    )
  }

  // ── Detail aktivní značky ──────────────────────────────────────
  if (!activeBrand) {
    return (
      <div className="space-y-2">
        {myBrands.map(b => (
          <a key={b.id} href={`/dashboard/znacka?id=${b.id}`}
            className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 transition hover:border-emerald-300">
            <Building2 className="h-5 w-5 text-emerald-600" />
            <span className="flex-1 font-semibold text-slate-800">{b.name}</span>
            <span className="text-xs font-semibold text-slate-400">{b.role}</span>
          </a>
        ))}
      </div>
    )
  }

  const clenove = activeBrand.members.filter(m => m.status === 'clen')
  const pozvani = activeBrand.members.filter(m => m.status === 'pozvan')
  const zadosti = activeBrand.members.filter(m => m.status === 'zadost')
  // Pozvánka, o které rozhoduju JÁ (jsem pozvaný)
  const mojePozvanka = pozvani.find(m => m.provider_id === currentUserId)

  return (
    <div className="space-y-4">
      {/* Hlavička značky */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex items-start gap-4">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-emerald-50">
            <Building2 className="h-7 w-7 text-emerald-600" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold tracking-tight text-slate-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
              {activeBrand.name}
            </h2>
            {activeBrand.city && <p className="text-sm text-slate-500">📍 {activeBrand.city}</p>}
            {activeBrand.bio && <p className="mt-2 text-sm leading-relaxed text-slate-600">{activeBrand.bio}</p>}
          </div>
        </div>
      </div>

      {/* Moje pozvánka (když jsem pozvaný a nerozhodl) */}
      {mojePozvanka && (
        <div className="rounded-2xl border-2 border-emerald-500 bg-emerald-50 p-5">
          <p className="text-sm font-bold text-slate-900">Byli jste pozváni do značky {activeBrand.name}</p>
          <p className="mt-0.5 text-sm text-slate-600">Po přijetí se vaše karty budou moct zobrazovat pod tímhle jménem.</p>
          <div className="mt-3 flex gap-2">
            <button onClick={() => handleRespond(mojePozvanka.member_id, true)} disabled={busy === mojePozvanka.member_id}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-60">
              {busy === mojePozvanka.member_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Přijmout
            </button>
            <button onClick={() => handleRespond(mojePozvanka.member_id, false)} disabled={busy === mojePozvanka.member_id}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
              Odmítnout
            </button>
          </div>
        </div>
      )}

      {/* Žádosti o připojení (vidí majitel) */}
      {isOwner && zadosti.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <p className="mb-3 text-sm font-bold text-amber-900">Žádosti o připojení ({zadosti.length})</p>
          <div className="space-y-2">
            {zadosti.map(m => (
              <div key={m.member_id} className="flex items-center gap-3 rounded-xl bg-white p-3">
                <span className="flex-1 text-sm font-semibold text-slate-800">{memberName(m)}</span>
                <button onClick={() => handleRespond(m.member_id, true)} disabled={busy === m.member_id}
                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-600 disabled:opacity-60">
                  {busy === m.member_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Schválit
                </button>
                <button onClick={() => handleRespond(m.member_id, false)} disabled={busy === m.member_id}
                  className="rounded-lg border border-slate-200 p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Členové */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="mb-3 flex items-center gap-2">
          <Users className="h-4 w-4 text-slate-400" />
          <h3 className="text-sm font-bold text-slate-700">Členové ({clenove.length})</h3>
        </div>
        <div className="space-y-2">
          {clenove.map(m => {
            const jeMajitel = m.provider_id === activeBrand.owner_id
            return (
              <div key={m.member_id} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3">
                <div className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-sm font-bold text-slate-500">
                  {memberName(m).charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800">{memberName(m)}</p>
                  {m.role_label && <p className="text-xs text-slate-400">{m.role_label}</p>}
                </div>
                {jeMajitel
                  ? <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700"><Crown className="h-3 w-3" /> Majitel</span>
                  : (isOwner && (
                    <button onClick={() => handleRemove(m.member_id, memberName(m))} disabled={busy === m.member_id}
                      className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600">
                      {busy === m.member_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                    </button>
                  ))}
              </div>
            )
          })}
        </div>

        {/* Odeslané pozvánky (čekající) */}
        {isOwner && pozvani.filter(m => m.provider_id !== currentUserId).length > 0 && (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <p className="mb-2 text-xs font-bold text-slate-400">Čeká na přijetí</p>
            {pozvani.filter(m => m.provider_id !== currentUserId).map(m => (
              <div key={m.member_id} className="flex items-center gap-3 py-1.5">
                <span className="flex-1 text-sm text-slate-500">{memberName(m)}</span>
                <span className="text-xs font-semibold text-slate-400">pozván</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pozvat člena (jen majitel) */}
      {isOwner && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="mb-3 flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-slate-400" />
            <h3 className="text-sm font-bold text-slate-700">Pozvat člena</h3>
          </div>
          <input
            value={hledani}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Hledejte podle jména nebo firmy…"
            className="block w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
          />
          {hledam && <p className="mt-2 text-xs text-slate-400">Hledám…</p>}
          {vysledky.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {vysledky.map(p => (
                <div key={p.id} className="flex items-center gap-3 rounded-xl border border-slate-100 p-2.5">
                  <div className="grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-xs font-bold text-slate-500">
                    {p.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-800">{p.name}</p>
                    {p.city && <p className="text-xs text-slate-400">{p.city}</p>}
                  </div>
                  <button onClick={() => handleInvite(p.id)} disabled={busy === p.id}
                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-600 disabled:opacity-60">
                    {busy === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />} Pozvat
                  </button>
                </div>
              ))}
            </div>
          )}
          {hledani.trim().length >= 2 && !hledam && vysledky.length === 0 && (
            <p className="mt-2 text-xs text-slate-400">
              Nikdo takový tu není. Kdo ještě není na Propoju, může se zaregistrovat — pak ho pozvete.
            </p>
          )}
        </div>
      )}

      {err && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
    </div>
  )
}