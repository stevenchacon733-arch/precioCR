-- PrecioCR V7 — Medicamentos (venta libre)
-- Ejecuta este archivo en Supabase > SQL Editor DESPUÉS de migration_v6_categories.sql

alter table public.listings
  drop constraint if exists listings_category_check;

alter table public.listings
  add constraint listings_category_check
  check (category in ('car', 'tech', 'supplement', 'medication'));
