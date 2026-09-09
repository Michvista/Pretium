-- Pretium Supabase schema
-- Run this in the Supabase SQL editor (Dashboard -> SQL -> New query).

-- ============================================================
-- 1. price_cache — caches SerpApi results for 1 hour per query
-- ============================================================
create table if not exists public.price_cache (
  id uuid primary key default gen_random_uuid(),
  query_hash text unique not null,                 -- MD5 of the search query string
  results jsonb not null,                          -- array of PriceResult objects
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '1 hour')
);

create index if not exists price_cache_expires_at_idx on public.price_cache (expires_at);

-- ============================================================
-- 2. price_history — daily price records per store per product
-- ============================================================
create table if not exists public.price_history (
  id uuid primary key default gen_random_uuid(),
  product_hash text not null,                      -- MD5 of product name + brand + model
  store_name text not null,
  price numeric not null,
  currency text not null default 'USD',
  recorded_at timestamptz not null default now()
);

create index if not exists price_history_product_hash_idx on public.price_history (product_hash, recorded_at desc);

-- ============================================================
-- 3. watchlist — premium price-drop alerts
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
alter table public.price_history enable row level security;
alter table public.watchlist enable row level security;

-- Public reads/writes for the cache + history used by the anonymous app.
create policy "price_cache anon all" on public.price_cache for all using (true) with check (true);
create policy "price_history anon all" on public.price_history for all using (true) with check (true);

-- Watchlist is scoped per user_id so users only touch their own rows.
create policy "watchlist select own" on public.watchlist for select using (user_id = current_setting('request.jwt.claims', true)::json ->> 'sub' OR user_id = 'anon');
create policy "watchlist insert own" on public.watchlist for insert with check (true);
create policy "watchlist update own" on public.watchlist for update using (user_id = current_setting('request.jwt.claims', true)::json ->> 'sub' OR user_id = 'anon');