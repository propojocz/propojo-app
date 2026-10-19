-- docs/sql/homepage-obrazky.sql
-- Obrázky v sekci „Jak to funguje“ na úvodní stránce (19. 10. 2026, Matej: varianta A – nahrává admin).
-- Při každém načtení stránky se ukáže náhodně jeden ze zapnutých obrázků (v rozmezí od–do, pokud je vyplněné).
-- Reklama (inzerent, štítek „Reklama“ podle DSA čl. 26) zatím ne – doplní se samostatně.
-- RLS zamčená, bez politik: čtení i zápis jen přes service role v server actions (lib/actions/homepage-images.ts).

create table if not exists public.homepage_images (
  id uuid primary key default gen_random_uuid(),
  image_url text not null,
  alt text not null default '',
  link_url text,
  is_active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.homepage_images enable row level security;
