-- ============================================================
-- MARKETPLACE PRO – Supabase PostgreSQL Schema
-- Spusť v Supabase SQL Editoru (Settings → SQL Editor)
-- ============================================================

-- ── EXTENSIONS ──────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── ENUM TYPY ───────────────────────────────────────────────
CREATE TYPE service_category AS ENUM (
  'remesla',
  'instalaterstvi',
  'elektrika',
  'malirstvi',
  'tesarstvi',
  'zahradnictvi',
  'uklid',
  'it_sluzby',
  'doprava',
  'jine'
);

CREATE TYPE order_status AS ENUM (
  'cekajici',
  'prijato',
  'v_procesu',
  'dokonceno',
  'zruseno'
);

-- ── TABULKA: profiles ────────────────────────────────────────
-- Rozšiřuje Supabase Auth uživatele
CREATE TABLE profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name    TEXT NOT NULL,
  avatar_url   TEXT,
  phone        TEXT,
  city         TEXT,
  bio          TEXT,
  is_provider  BOOLEAN NOT NULL DEFAULT false,
  rating       NUMERIC(3,2) DEFAULT 0,
  review_count INTEGER DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Automaticky vytvoří profil při registraci
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE handle_new_user();

-- Automaticky aktualizuje updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- ── TABULKA: services ────────────────────────────────────────
CREATE TABLE services (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title        TEXT NOT NULL CHECK (char_length(title) BETWEEN 5 AND 100),
  description  TEXT NOT NULL CHECK (char_length(description) BETWEEN 20 AND 2000),
  category     service_category NOT NULL,
  price        NUMERIC(10,2) NOT NULL CHECK (price > 0),
  price_unit   TEXT NOT NULL DEFAULT 'hod',   -- hod / kus / den / projekt
  city         TEXT NOT NULL,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  image_url    TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_services_provider    ON services(provider_id);
CREATE INDEX idx_services_category    ON services(category);
CREATE INDEX idx_services_city        ON services(city);
CREATE INDEX idx_services_is_active   ON services(is_active);
CREATE INDEX idx_services_created_at  ON services(created_at DESC);

CREATE TRIGGER services_updated_at
  BEFORE UPDATE ON services
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- ── TABULKA: orders ──────────────────────────────────────────
CREATE TABLE orders (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_id    UUID NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
  client_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  provider_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  status        order_status NOT NULL DEFAULT 'cekajici',
  message       TEXT,
  scheduled_at  TIMESTAMPTZ,
  price_agreed  NUMERIC(10,2),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_orders_service_id   ON orders(service_id);
CREATE INDEX idx_orders_client_id    ON orders(client_id);
CREATE INDEX idx_orders_provider_id  ON orders(provider_id);
CREATE INDEX idx_orders_status       ON orders(status);

CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders   ENABLE ROW LEVEL SECURITY;

-- ── profiles RLS ─────────────────────────────────────────────
-- Číst může každý
CREATE POLICY "profiles_select_public"
  ON profiles FOR SELECT
  USING (true);

-- Editovat může jen vlastník
CREATE POLICY "profiles_insert_own"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_own"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_delete_own"
  ON profiles FOR DELETE
  USING (auth.uid() = id);

-- ── services RLS ─────────────────────────────────────────────
-- Číst může každý (aktivní služby)
CREATE POLICY "services_select_public"
  ON services FOR SELECT
  USING (is_active = true OR auth.uid() = provider_id);

-- Vkládat může jen přihlášený uživatel (pro své ID)
CREATE POLICY "services_insert_own"
  ON services FOR INSERT
  WITH CHECK (auth.uid() = provider_id);

-- Editovat může jen vlastník
CREATE POLICY "services_update_own"
  ON services FOR UPDATE
  USING (auth.uid() = provider_id)
  WITH CHECK (auth.uid() = provider_id);

-- Mazat může jen vlastník
CREATE POLICY "services_delete_own"
  ON services FOR DELETE
  USING (auth.uid() = provider_id);

-- ── orders RLS ───────────────────────────────────────────────
-- Vidí jen zúčastnění (klient nebo poskytovatel)
CREATE POLICY "orders_select_participant"
  ON orders FOR SELECT
  USING (auth.uid() = client_id OR auth.uid() = provider_id);

CREATE POLICY "orders_insert_client"
  ON orders FOR INSERT
  WITH CHECK (auth.uid() = client_id);

CREATE POLICY "orders_update_participant"
  ON orders FOR UPDATE
  USING (auth.uid() = client_id OR auth.uid() = provider_id);

-- ============================================================
-- SEED DATA (volitelné – pro testování)
-- Odkomentuj pokud chceš mít demo data
-- ============================================================
/*
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-000000000001', 'jan.novak@demo.cz'),
  ('00000000-0000-0000-0000-000000000002', 'petra.svoboda@demo.cz');

INSERT INTO profiles (id, full_name, city, bio, is_provider) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Jan Novák', 'Praha', 'Elektrikář s 15 lety zkušeností.', true),
  ('00000000-0000-0000-0000-000000000002', 'Petra Svobodová', 'Brno', 'Profesionální malířka pokojů.', true);

INSERT INTO services (provider_id, title, description, category, price, price_unit, city) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Instalace elektrických zásuvek', 'Profesionální instalace zásuvek, vypínačů a osvětlení.', 'elektrika', 650, 'hod', 'Praha'),
  ('00000000-0000-0000-0000-000000000002', 'Malování pokojů na klíč', 'Kompletní příprava povrchu, základní nátěr a 2× finální barva.', 'malirstvi', 120, 'hod', 'Brno');
*/
