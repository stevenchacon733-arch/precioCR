-- PrecioCR V8 — solo Autos + Tecnología
-- Ejecuta en Supabase > SQL Editor si anteriormente habilitaste otras categorías.
--
-- NOT VALID evita borrar datos viejos de suplementos/medicamentos:
-- las filas existentes pueden quedarse guardadas, pero las NUEVAS filas
-- solo podrán usar 'car' o 'tech'.

alter table public.listings
  drop constraint if exists listings_category_check;

alter table public.listings
  add constraint listings_category_check
  check (category in ('car', 'tech')) not valid;
