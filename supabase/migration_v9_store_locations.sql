-- PrecioCR: locales opcionales para productos de tecnología.
-- Ejecutar en Supabase > SQL Editor antes de guardar locales desde /admin o CSV.
-- Conserva los anuncios actuales; una lista vacía indica locales no informados.

alter table public.listings
  add column if not exists store_locations jsonb not null default '[]'::jsonb
  check (jsonb_typeof(store_locations) = 'array');

comment on column public.listings.store_locations is
  'Locales informados por la fuente: name, address, province, availability (available/unavailable/unknown), url. Una sucursal no implica inventario confirmado.';
