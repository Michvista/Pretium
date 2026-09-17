-- Pretium Supabase schema
-- Run this in the Supabase SQL editor (Dashboard -> SQL -> New query).

-- ============================================================
-- 1. price_cache — caches SerpApi results for 1 hour per query
-- ============================================================
create table if not exists public.price_cache (
  id uuid primary key default gen_random_uuid(),
  query_hash text unique not null,                 -- MD5 of the search query string
  results jsonb not null,                          -- array of PriceResult / RetailerListing objects
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '1 hour')
);

create index if not exists price_cache_expires_at_idx on public.price_cache (expires_at);

-- ============================================================
-- 2. products — canonical products and structured attributes
-- ============================================================
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  product_hash text unique not null,               -- MD5 hash identifying the canonical product
  name text not null,
  brand text,
  model text,
  category text,
  condition text,                                  -- 'new' | 'refurbished' | 'used'
  source text not null default 'text',             -- 'text' | 'image' | 'link'
  source_url text,
  search_query text not null,
  specifications jsonb not null default '{}'::jsonb, -- structured key-value specs
  identifiers jsonb not null default '{}'::jsonb,    -- gtin, upc, mpn, sku, asin
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists products_product_hash_idx on public.products (product_hash);

-- ============================================================
-- 3. price_history — daily price records and snapshots per store per product
-- ============================================================
create table if not exists public.price_history (
  id uuid primary key default gen_random_uuid(),
  product_hash text not null,                      -- MD5 of product name + brand + model
  store_name text not null,
  price numeric not null,
  currency text not null default 'USD',
  shipping_cost numeric,
  total_cost numeric,
  product_url text,
  raw_title text,
  match_confidence numeric,                        -- reserved for future matching pipeline (Phase 6)
  recorded_at timestamptz not null default now()
);

-- Ensure snapshot columns exist if table was already created in an earlier migration
alter table public.price_history add column if not exists shipping_cost numeric;
alter table public.price_history add column if not exists total_cost numeric;
alter table public.price_history add column if not exists product_url text;
alter table public.price_history add column if not exists raw_title text;
alter table public.price_history add column if not exists match_confidence numeric;

-- Chronological price-history retrieval indexes by product and store
create index if not exists price_history_product_hash_idx on public.price_history (product_hash, recorded_at desc);
create index if not exists price_history_store_idx on public.price_history (product_hash, store_name, recorded_at desc);

-- ============================================================
-- 4. watchlist — premium price-drop alerts
-- ============================================================
create table if not exists public.watchlist (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,                           -- RevenueCat user ID
  product_name text not null,
  product_hash text not null,
  target_price numeric not null,
  current_price numeric,
  currency text not null default 'USD',
  image_url text,
  created_at timestamptz not null default now(),
  unique (user_id, product_hash)
);

create index if not exists watchlist_user_id_idx on public.watchlist (user_id);

-- ============================================================
-- Row Level Security (hackathon-friendly, open by default)
-- ============================================================
alter table public.price_cache enable row level security;
alter table public.products enable row level security;
alter table public.price_history enable row level security;
alter table public.watchlist enable row level security;

-- Public reads/writes for cache, products, and history used by the anonymous app.
drop policy if exists "price_cache anon all" on public.price_cache;
create policy "price_cache anon all" on public.price_cache for all using (true) with check (true);

drop policy if exists "products anon all" on public.products;
create policy "products anon all" on public.products for all using (true) with check (true);

drop policy if exists "price_history anon all" on public.price_history;
create policy "price_history anon all" on public.price_history for all using (true) with check (true);

-- Watchlist is scoped per user_id so users only touch their own rows.
drop policy if exists "watchlist select own" on public.watchlist;
create policy "watchlist select own" on public.watchlist for select using (user_id = current_setting('request.jwt.claims', true)::json ->> 'sub' OR user_id = 'anon');

drop policy if exists "watchlist insert own" on public.watchlist;
create policy "watchlist insert own" on public.watchlist for insert with check (true);

drop policy if exists "watchlist update own" on public.watchlist;
create policy "watchlist update own" on public.watchlist for update using (user_id = current_setting('request.jwt.claims', true)::json ->> 'sub' OR user_id = 'anon');
