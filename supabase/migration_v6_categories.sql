-- PrecioCR V6.1 — solo Suplementos
-- Ejecuta este archivo en Supabase > SQL Editor DESPUÉS del schema V5.

alter table public.listings
  drop constraint if exists listings_category_check;

alter table public.listings
  add constraint listings_category_check
  check (category in ('car', 'tech', 'supplement'));
