import { isDatabaseConfigured, listActiveListings } from "@/lib/db";
import { enrichTechOffer, normalizeStoreLocations } from "@/lib/store-locations";
import {
  parseCarQuery,
  listingMatchesCar,
  enrichCarOffer,
  normalizeText,
} from "@/lib/car";

function daysOld(dateString) {
  if (!dateString) return 0;
  const value = new Date(`${dateString}T12:00:00Z`);
  if (Number.isNaN(value.getTime())) return 0;

  const now = new Date();
  return Math.max(0, Math.floor((now.getTime() - value.getTime()) / 86400000));
}

function freshnessWeight(dateString) {
  const age = daysOld(dateString);
  if (age <= 14) return 1;
  if (age <= 30) return 0.8;
  if (age <= 60) return 0.5;
  return 0;
}

function marketLabel(segment) {
  if (segment === "particular") return "Mercado particular";
  if (segment === "portal") return "Portal de autos";
  if (segment === "agencia") return "Agencia / seminuevos";
  return "Base PrecioCR";
}

function rowToCarOffer(row, spec) {
  const title =
    row.title ||
    [row.brand, row.model, row.year].filter(Boolean).join(" ") ||
    "Vehículo";

  return enrichCarOffer(
    {
      source: row.source || "Base PrecioCR",
      sourceGroup: row.market_segment || "particular",
      sourceGroupLabel: marketLabel(row.market_segment),
      title,
      price: Number(row.price_crc),
      originalPrice: row.price_original ? Number(row.price_original) : null,
      originalCurrency: row.currency || "CRC",
      url: row.url || "#",
      condition: row.condition || "Usado / consultar",
      meta: row.notes || "",
      year: row.year ? Number(row.year) : null,
      km: row.kilometers ? Number(row.kilometers) : null,
      transmission: row.transmission || null,
      fuel: row.fuel || null,
      province: row.province || null,
      verified: Boolean(row.verified),
      observedAt: row.observed_at || null,
      expiresAt: row.expires_at || null,
      dataOrigin: "database",
      freshnessWeight: freshnessWeight(row.observed_at),
      databaseId: row.id,
    },
    spec
  );
}

function techTokens(query = "") {
  return normalizeText(query)
    .split(" ")
    .filter((x) => x.length >= 2 && !["de", "la", "el", "gb"].includes(x));
}

function rowToTechOffer(row) {
  return enrichTechOffer({
    source: row.source || "Base PrecioCR",
    title:
      row.title ||
      [row.brand, row.model, row.year].filter(Boolean).join(" ") ||
      "Producto",
    price: Number(row.price_crc),
    originalPrice: row.price_original ? Number(row.price_original) : null,
    originalCurrency: row.currency || "CRC",
    url: row.url || "#",
    condition: row.condition || "Consultar",
    meta: [row.brand, row.model, row.notes].filter(Boolean).join(" · "),
    storeLocations: row.store_locations?.length
      ? row.store_locations
      : row.province
      ? [{ name: row.source || "Base PrecioCR", address: row.province, province: row.province, availability: "unknown" }]
      : [],
    verified: Boolean(row.verified),
    observedAt: row.observed_at || null,
    expiresAt: row.expires_at || null,
    dataOrigin: "database",
    freshnessWeight: freshnessWeight(row.observed_at),
    databaseId: row.id,
  });
}

function sourceStatuses(offers) {
  const map = new Map();

  for (const offer of offers) {
    const source = offer.source || "Base PrecioCR";
    const current = map.get(source) || {
      source,
      url: offer.url || "#",
      ok: true,
      count: 0,
      error: null,
      offers: [],
      database: true,
    };

    current.count += 1;
    current.offers.push(offer);

    if ((!current.url || current.url === "#") && offer.url) {
      current.url = offer.url;
    }

    map.set(source, current);
  }

  return [...map.values()];
}

export async function searchDatabaseListings(query, type) {
  if (!isDatabaseConfigured()) {
    return {
      offers: [],
      sources: [],
      configured: false,
      error: "Base PrecioCR no configurada",
    };
  }

  try {
    const rows = await listActiveListings(type, 500);

    if (type === "car") {
      const spec = parseCarQuery(query);

      const offers = rows
        .filter((row) => {
          if (!row.price_crc) return false;

          const text = [
            row.title,
            row.brand,
            row.model,
            row.year,
            row.notes,
          ]
            .filter(Boolean)
            .join(" ");

          return listingMatchesCar(text, spec, { strictYear: false });
        })
        .map((row) => rowToCarOffer(row, spec))
        .filter((offer) => {
          if (spec.year && offer.year && offer.year !== spec.year) return false;
          return offer.freshnessWeight > 0 && Number(offer.price) >= 500000;
        });

      return {
        offers,
        sources: sourceStatuses(offers),
        configured: true,
        error: null,
      };
    }

    const tokens = techTokens(query);

    const offers = rows
      .filter((row) => {
        if (!row.price_crc) return false;
        const text = normalizeText(
          [row.title, row.brand, row.model, row.notes]
            .filter(Boolean)
            .join(" ")
        );
        return tokens.every((token) => text.includes(token));
      })
      .map(rowToTechOffer)
      .filter((offer) => offer.freshnessWeight > 0);

    return {
      offers,
      sources: sourceStatuses(offers),
      configured: true,
      error: null,
    };
  } catch (error) {
    return {
      offers: [],
      sources: [],
      configured: true,
      error: error?.message || "No se pudo consultar Base PrecioCR",
    };
  }
}

export function mergeSourceStatuses(a = [], b = []) {
  const map = new Map();

  for (const source of [...a, ...b]) {
    const key = source.source;
    const current = map.get(key) || {
      source: key,
      url: source.url || "#",
      ok: source.ok !== false,
      count: 0,
      error: source.error || null,
      offers: [],
      database: false,
    };

    current.count += Number(source.count || 0);
    current.ok = current.ok || source.ok !== false;
    current.database = current.database || Boolean(source.database);
    current.offers.push(...(source.offers || []));

    if ((!current.url || current.url === "#") && source.url) {
      current.url = source.url;
    }

    if (current.count > 0) current.error = null;
    else if (source.error) current.error = source.error;

    map.set(key, current);
  }

  return [...map.values()];
}

export function dedupeCombinedOffers(offers = []) {
  const map = new Map();

  for (const offer of offers) {
    const normalizedUrl =
      offer.url && offer.url !== "#"
        ? normalizeText(offer.url).replace(/\s/g, "")
        : "";

    const key = normalizedUrl
      ? `url:${normalizedUrl}`
      : [
          offer.source,
          offer.price,
          offer.year || "",
          normalizeText(offer.title || "").slice(0, 90),
        ].join("|");

    const existing = map.get(key);

    if (!existing) {
      map.set(key, offer);
      continue;
    }

    // Prefer verified data without dropping locations published by the other source.
    const preferIncoming = (
      offer.dataOrigin === "database" &&
      offer.verified &&
      !(existing.dataOrigin === "database" && existing.verified)
    );
    const preferred = preferIncoming ? offer : existing;
    const other = preferIncoming ? existing : offer;
    const merged = { ...preferred, province: preferred.province || other.province || null };
    if (preferred.storeLocations || other.storeLocations) {
      const withLocations = [preferred, other].filter((row) => row.storeLocations?.length);
      const productLocations = withLocations.filter((row) => row.storeLocationsScope !== "retailer");
      const selected = productLocations.length ? productLocations : withLocations;
      merged.storeLocationsScope = productLocations.length ? "product" : "retailer";
      merged.storeLocations = normalizeStoreLocations(
        selected.flatMap((row) => row.storeLocations),
        { source: preferred.source, baseUrl: preferred.url }
      );
      merged.storeLocationsUrl = preferred.storeLocationsUrl || other.storeLocationsUrl;
      map.set(key, enrichTechOffer(merged));
    } else {
      map.set(key, merged);
    }
  }

  return [...map.values()];
}
