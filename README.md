# PrecioCR V5 — Base propia + Admin + CSV

PrecioCR V5 combina:

1. Fuentes automáticas que sí responden desde Vercel.
2. Base PrecioCR en Supabase.
3. Datos manuales como Facebook Marketplace, Grupo Q, Purdy, Veinsa, etc.
4. Importación masiva por CSV.
5. Ponderación por antigüedad.

## 1. Crear Supabase

1. Crea un proyecto en Supabase.
2. Ve a **SQL Editor**.
3. Copia todo el archivo `supabase/schema.sql`.
4. Ejecútalo.

Después entra a la configuración/API de tu proyecto y copia:

- Project URL
- `service_role` key

La service role es SECRETA. No la pegues en GitHub ni en código del navegador.

## 2. Variables en Vercel

Vercel > tu proyecto > Settings > Environment Variables:

```text
SUPABASE_URL
SUPABASE_SECRET_KEY
ADMIN_PASSWORD
```

Aplica las variables a Production y vuelve a hacer Deploy.

## 3. Administrador

Abre:

```text
https://tu-dominio.com/admin
```

Inicia sesión con `ADMIN_PASSWORD`.

Desde ahí puedes:

- agregar un anuncio manual;
- importar un CSV;
- cambiar un anuncio a vendido/expirado;
- eliminarlo;
- descargar la Base PrecioCR como CSV.

## 4. Importación

La plantilla CSV está disponible en:

```text
/preciocr_import_template.csv
```

Columnas:

```text
source
category
market_segment
brand
model
year
title
price_crc
price_original
currency
kilometers
transmission
fuel
condition
province
url
verified
status
observed_at
expires_at
notes
```

Valores recomendados:

- category: `car` o `tech`
- market_segment: `particular`, `portal`, `agencia`, `retail`
- currency: `CRC` o `USD`
- verified: `true`
- status: `active`, `sold`, `removed`, `expired`
- fechas: `YYYY-MM-DD`

## 5. Marketplace

Ejemplo:

```csv
source,category,market_segment,brand,model,year,title,price_crc,currency,kilometers,transmission,fuel,condition,province,url,verified,status,observed_at,notes
Facebook Marketplace,car,particular,Toyota,RAV4,2024,Toyota RAV4 2024,17900000,CRC,28000,Automática,Gasolina,Usado,San José,https://facebook.com/marketplace/item/...,true,active,2026-09-11,9/10
```

Marketplace expira por defecto a 60 días si dejas `expires_at` vacío.

## 6. Peso por antigüedad

- 0–14 días: 100%
- 15–30 días: 80%
- 31–60 días: 50%
- expirado: no participa

La Base PrecioCR y las fuentes automáticas se mezclan antes de calcular el score.

## Seguridad

- `SUPABASE_SECRET_KEY` solo se usa en rutas server-side.
- El administrador utiliza una cookie HttpOnly.
- No existe escritura pública directa hacia Supabase.
- No publiques `.env.local`.


## V5.2 — claves nuevas de Supabase

Para proyectos nuevos usa `SUPABASE_SECRET_KEY` con la clave que empieza por
`sb_secret_`. El backend la envía únicamente en el header `apikey`.

Se mantiene compatibilidad opcional con la antigua variable
`SUPABASE_SERVICE_ROLE_KEY`, pero no es necesaria para proyectos nuevos.


## V6.1 — Solo Suplementos

Nueva categoría:

- `supplement`: suplementos básicos como proteína, creatina, electrolitos, vitaminas, colágeno y barras proteicas.

Fuentes automáticas iniciales:

- Walmart Costa Rica
- FitMart
- Bionatural CR
- Fitness Shop CR
- Base PrecioCR

La sección de bienestar fue eliminada por completo de la interfaz y del administrador.

### Migración Supabase

Ejecuta:

`supabase/migration_v6_categories.sql`

para permitir `car`, `tech` y `supplement`.

### Filtros

PrecioCR limita esta categoría a suplementos básicos y excluye categorías de alto riesgo.
