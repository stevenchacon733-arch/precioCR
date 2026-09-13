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

Para guardar locales de productos de tecnología en una base existente, ejecuta
`supabase/migration_v9_store_locations.sql` en Supabase > SQL Editor. En una base
nueva, `supabase/schema.sql` ya incluye la columna. Los anuncios sin locales
siguen guardándose sin esta migración; guardar locales sí la requiere.

## Ubicaciones opcionales

En autos, **Filtrar ubicación** permite limitar los resultados por provincia.
El filtro está desactivado por defecto. En `/admin`, la provincia del anuncio
también es opcional: usa **Sin especificar** cuando la fuente no la indique.

En tecnología, el campo **Locales del producto (opcional)** de `/admin` acepta
una ubicación por línea con el formato `nombre | dirección | provincia`.
La dirección y la provincia pueden omitirse. Agrega solo locales informados por
la fuente; registrar una sucursal no confirma inventario del producto.

La columna CSV opcional `store_locations` conserva los locales al importar y
descargar la base. Su contenido es una lista JSON, por ejemplo:

```json
[{"name":"Sucursal indicada por la fuente","address":"Dirección publicada","province":"San José","availability":"unknown"}]
```

Si editas el CSV como texto, encierra la celda JSON entre comillas dobles y duplica
sus comillas interiores. Excel y Google Sheets lo hacen al exportar.
Se admiten hasta 50 locales por producto. Cada local requiere `name` y puede
incluir `address`, `province` y una `url` HTTP/HTTPS. `availability` admite
`unknown` (por defecto), `available` o `unavailable`; usa los dos últimos solo
cuando la fuente confirme el inventario del producto en ese local. Las filas de
autos deben dejar `store_locations` vacío o usar `[]`. Una lista de locales vacía
significa que no se informó una ubicación.

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
