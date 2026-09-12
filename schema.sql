-- PrecioCR V5
-- Ejecuta este archivo completo en Supabase > SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),

  source text not null,
  category text not null check (category in ('car', 'tech')),
  market_segment text not null default 'particular'
    check (market_segment in ('particular', 'portal', 'agencia', 'retail')),

  brand text,
  model text,
  year integer check (year is null or (year >= 1980 and year <= 2035)),
  title text,

  price_crc bigint not null check (price_crc > 0),
  price_original numeric,
  currency text not null default 'CRC',

  kilometers integer check (kilometers is null or kilometers >= 0),
  transmission text,
  fuel text,
  condition text,
  province text,

  url text,
  verified boolean not null default true,
  status text not null default 'active'
    check (status in ('active', 'sold', 'removed', 'expired')),

  observed_at date not null default current_date,
  expires_at date,
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists listings_category_status_idx
  on public.listings (category, status);

create index if not exists listings_car_lookup_idx
  on public.listings (brand, model, year);

create index if not exists listings_observed_idx
  on public.listings (observed_at desc);

create index if not exists listings_expiry_idx
  on public.listings (expires_at);

create index if not exists listings_source_idx
  on public.listings (source);

-- Evita duplicar el mismo enlace cuando hay URL.
create unique index if not exists listings_unique_url
  on public.listings (url)
  where url is not null and length(url) > 8;

alter table public.listings enable row level security;

-- No creamos políticas públicas.
-- PrecioCR accede a esta tabla SOLO desde funciones server-side de Vercel
-- usando SUPABASE_SERVICE_ROLE_KEY. Esa llave nunca debe ir al navegador.
