# PrecioCR V8 — Autos + Tecnología

Esta versión vuelve PrecioCR a sus dos categorías principales:

- 🚗 Autos
- 📱 Tecnología

Se mantienen:

- fuentes automáticas de autos;
- fuentes automáticas de tecnología;
- Base PrecioCR / Supabase;
- panel `/admin`;
- importación CSV;
- Facebook Marketplace como fuente externa donde aplica;
- ponderación por antigüedad;
- análisis de autos por año, fuente y tipo de mercado.

Se eliminaron del código activo:

- Suplementos
- Medicamentos
- Conectores de farmacias
- Conectores de suplementos
- Opciones de esas categorías en `/admin`

## Supabase

Si ya habías ejecutado migraciones de categorías anteriores, ejecuta:

`supabase/migration_v8_cars_tech_only.sql`

La migración no borra filas antiguas. Solo impide crear nuevas filas fuera de `car` y `tech`.

## Categorías válidas

```text
car
tech
```

## Variables de Vercel

```text
SUPABASE_URL
SUPABASE_SECRET_KEY
ADMIN_PASSWORD
```

No publiques `SUPABASE_SECRET_KEY`.
