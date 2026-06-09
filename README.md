# ŽivnoTrh – Marketplace pro živnostníky

Produkční Next.js marketplace s real-time daty ze Supabase. Bez mock dat, bez statických polí.

## Technologie

- **Next.js 14** (App Router, Server Components, Server Actions)
- **TypeScript** (striktní typování)
- **Tailwind CSS** (vlastní design systém – Fraunces + DM Sans, Slate/Indigo paleta)
- **Supabase** (PostgreSQL, RLS, Auth)
- **react-hook-form + Zod** (validace formulářů)
- **framer-motion** (animace)
- **Lucide React** (ikony)

## Struktura projektu

```
├── app/
│   ├── layout.tsx              # Root layout s navigací
│   ├── page.tsx                # Homepage (hero + featured services z DB)
│   ├── globals.css             # Design systém + custom komponenty
│   ├── error.tsx               # Globální error boundary
│   ├── not-found.tsx           # 404 stránka
│   ├── marketplace/
│   │   ├── page.tsx            # ← Hlavní Server Component (fetch z DB)
│   │   ├── loading.tsx         # Streaming skeleton
│   │   └── error.tsx           # Route-level error boundary
│   ├── pridat-sluzbu/
│   │   └── page.tsx            # Chráněná stránka pro přidání služby
│   └── sluzby/[id]/
│       └── page.tsx            # Detail služby s real DB daty
├── components/
│   ├── forms/
│   │   └── ServiceForm.tsx     # react-hook-form + zod + Server Action
│   └── ui/
│       ├── ServiceCard.tsx     # Karta služby
│       ├── ServiceListSkeleton.tsx
│       ├── FilterBar.tsx       # Client-side filtrování (URL params)
│       ├── Navbar.tsx          # Server Component s auth stavem
│       ├── NavUserMenu.tsx     # Dropdown menu (Client Component)
│       ├── OrderButton.tsx     # Objednávkový formulář
│       └── Footer.tsx
├── lib/
│   ├── supabase/
│   │   ├── server.ts           # Server-side Supabase client
│   │   └── client.ts           # Browser-side Supabase client
│   └── actions/
│       ├── services.ts         # CRUD Server Actions pro services
│       └── orders.ts           # Server Actions pro orders
├── types/
│   └── database.ts             # TypeScript typy přesně odpovídající DB schématu
└── supabase/
    └── schema.sql              # Kompletní SQL skript (tabulky + RLS + triggers)
```

## Rychlý start

### 1. Klonování a instalace

```bash
git clone <repo>
cd zivnotrh-marketplace
npm install
```

### 2. Supabase projekt

1. Vytvoř projekt na [supabase.com](https://supabase.com)
2. V **SQL Editoru** spusť celý soubor `supabase/schema.sql`
3. Povolte Auth v **Authentication → Settings**
4. Nastav Redirect URLs: `http://localhost:3000/**`

### 3. Proměnné prostředí

```bash
cp .env.example .env.local
```

Vyplň hodnoty z **Supabase → Settings → API**:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
```

### 4. Spuštění

```bash
npm run dev
```

Otevři [http://localhost:3000](http://localhost:3000) 🎉

## Databázové schéma

### `profiles`
Rozšiřuje Supabase Auth uživatele. Vytváří se automaticky triggerem po registraci.

| Sloupec | Typ | Popis |
|---------|-----|-------|
| id | UUID | FK → auth.users |
| full_name | TEXT | Celé jméno |
| is_provider | BOOLEAN | Je uživatel živnostník? |
| rating | NUMERIC(3,2) | Průměrné hodnocení |
| ... | | |

### `services`
Nabídky živnostníků.

| Sloupec | Typ | Popis |
|---------|-----|-------|
| id | UUID | PK |
| provider_id | UUID | FK → profiles |
| title | TEXT | Název (5–100 znaků) |
| category | ENUM | Jedna z 10 kategorií |
| price | NUMERIC | Cena v Kč |
| price_unit | TEXT | hod/kus/den/projekt |
| ... | | |

### `orders`
Poptávky zákazníků.

### RLS pravidla

- **services**: Číst může každý (is_active = true), editovat jen vlastník
- **profiles**: Číst může každý, editovat jen vlastník
- **orders**: Vidí jen klient a poskytovatel

## Přidání autentifikace

Pro přihlašovací stránky použij [Supabase Auth UI](https://supabase.com/docs/guides/auth/auth-helpers/nextjs) nebo vytvoř vlastní formuláře s:

```typescript
// Registrace
const { error } = await supabase.auth.signUp({
  email, password,
  options: { data: { full_name: name } }
})

// Přihlášení
const { error } = await supabase.auth.signInWithPassword({ email, password })
```

## Produkční nasazení

```bash
npm run build
npm run typecheck  # TypeScript kontrola před deploymentem
```

Doporučené platformy: **Vercel** (nativní Next.js podpora), Railway, Fly.io.

Nastav env proměnné v dashboardu platformy – stejné jako v `.env.local`.
