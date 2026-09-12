import * as cheerio from "cheerio";
import {
  parseCarQuery,
  listingMatchesCar,
  enrichCarOffer,
  normalizeText,
} from "@/lib/car";

const UA =
  "Mozilla/5.0 (compatible; PrecioCR/0.4; +https://precio-cr.vercel.app)";

const CAR_SOURCE_META = {
  "Encuentra24": { group: "particular", label: "Mercado particular" },
  "MercadoLibre": { group: "particular", label: "Mercado particular" },
  "CRAutos": { group: "portal", label: "Portal de autos" },
  "AutoCosmos": { group: "portal", label: "Portal de autos" },
  "Purdy Usados": { group: "agencia", label: "Agencia / seminuevos" },
};

const TECH_CONFIG = [
  {
    name: "Walmart Costa Rica",
    domain: "walmart.co.cr",
    minPrice: 5000,
  },
  {
    name: "Gollo",
    domain: "gollo.com",
    minPrice: 5000,
    buildUrl: (q) =>
      `https://www.gollo.com/catalogsearch/result/?q=${encodeURIComponent(q)}`,
  },
  {
    name: "Intelec",
    domain: "intelec.co.cr",
    minPrice: 5000,
    buildUrl: (q) =>
      `https://www.intelec.co.cr/?s=${encodeURIComponent(q)}&post_type=product`,
  },
];

const EXTERNAL_SEARCHES = {
  car: [
    {
      name: "Facebook Marketplace",
      note: "Búsqueda directa en Marketplace Costa Rica; Facebook puede pedir iniciar sesión",
      buildUrl: (q) =>
        `https://www.facebook.com/marketplace/search/?query=${encodeURIComponent(q)}`,
    },
  ],
  tech: [
    {
      name: "Facebook Marketplace",
      note: "Búsqueda externa; Facebook puede pedir iniciar sesión",
      buildUrl: (q) =>
        `https://www.facebook.com/marketplace/search/?query=${encodeURIComponent(q)}`,
    },
    {
      name: "ExtremeTech",
      note: "Búsqueda externa",
      buildUrl: (q) =>
        `https://extremetechcr.com/?s=${encodeURIComponent(q)}&post_type=product`,
    },
    {
      name: "Unimart",
      note: "Búsqueda externa",
      buildUrl: (q) =>
        `https://www.unimart.com/search?q=${encodeURIComponent(q)}&type=product`,
    },
  ],
};

function cleanTitle(value = "") {
  return String(value).replace(/\s+/g, " ").trim().slice(0, 220);
}

function absoluteUrl(href, base) {
  try {
    return new URL(href, base).toString();
  } catch {
    return base;
  }
}

function parseCRCPrices(text = "") {
  const found = [];
  const rx = /(?:₡|¢)\s*([\d][\d.,\s\u00A0\u202F]*)/g;
  let m;
  while ((m = rx.exec(text))) {
    const value = Number(m[1].replace(/[^\d]/g, ""));
    if (Number.isFinite(value)) found.push(value);
  }
  return found;
}

function parseFirstCRCPrice(text = "") {
  const prices = parseCRCPrices(text);
  return prices.length ? prices[0] : null;
}

function techTokens(query) {
  const ignored = new Set([
    "de", "la", "el", "los", "las", "con", "para", "gb",
    "nuevo", "nueva", "usado", "usada",
  ]);

  return normalizeText(query)
    .split(" ")
    .filter((x) => x.length >= 2 && !ignored.has(x));
}

function relevance(text, query) {
  const tokens = techTokens(query);
  if (!tokens.length) return 0;
  const haystack = normalizeText(text);
  const hits = tokens.filter((t) => haystack.includes(t)).length;
  return hits / tokens.length;
}

async function fetchText(url, timeoutMs = 8500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      headers: {
        "user-agent": UA,
        "accept-language": "es-CR,es;q=0.9,en;q=0.6",
        accept: "text/html,application/xhtml+xml,application/json,text/plain,*/*",
      },
      signal: controller.signal,
      next: { revalidate: 900 },
    });

    const text = await res.text();

    return {
      ok: res.ok,
      status: res.status,
      text: res.ok ? text : "",
      error: res.ok ? null : `HTTP ${res.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      text: "",
      error: error?.name === "AbortError" ? "Tiempo agotado" : "No disponible",
    };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url, timeoutMs = 8500) {
  const fetched = await fetchText(url, timeoutMs);
  if (!fetched.ok) return { ...fetched, data: null };

  try {
    return { ...fetched, data: JSON.parse(fetched.text) };
  } catch {
    return { ...fetched, ok: false, data: null, error: "JSON inválido" };
  }
}

function sourceStatus(source, url, offers, error = null) {
  return {
    source,
    url,
    ok: !error,
    count: offers.length,
    error: offers.length ? null : error || "Sin coincidencias verificables",
    offers,
  };
}

function carOffer(source, sourceGroup, sourceGroupLabel, data, spec) {
  return enrichCarOffer(
    {
      source,
      sourceGroup,
      sourceGroupLabel,
      condition: "Usado / consultar",
      ...data,
    },
    spec
  );
}

function findCardContainer($, el, maxLevels = 8) {
  let node = $(el);

  for (let i = 0; i < maxLevels; i++) {
    const text = cleanTitle(node.text());
    if (
      text.length >= 25 &&
      text.length <= 2400 &&
      /(?:₡|¢)\s*[\d]/.test(text)
    ) {
      return node;
    }

    const parent = node.parent();
    if (!parent?.length) break;
    node = parent;
  }

  return $(el);
}

function cleanCarTitle(text, price) {
  let title = cleanTitle(text)
    .replace(/\b\d+\s*\/\s*\d+\s*Previous slideNext slide\b/gi, " ")
    .replace(/\b(Resaltado|Destacado|Oportunidad|Exclusivo|Poco Kilometraje|Poco uso|A estrenar)\b/gi, " ")
    .replace(/(?:Contactar|Llamar|WhatsApp)[\s\S]*$/i, " ");

  if (price) {
    title = title
      .replace(/(?:₡|¢)\s*[\d][\d.,\s\u00A0\u202F]*/g, " ")
      .replace(/\$\s*[\d.,]+/g, " ");
  }

  return title.replace(/\s+/g, " ").trim().slice(0, 180);
}

// -------------------- AUTOS --------------------

async function searchEncuentra24(query, spec) {
  const url =
    `https://www.encuentra24.com/costa-rica-es/autos-usados?q=keyword.${encodeURIComponent(query)}`;

  const fetched = await fetchText(url);
  if (!fetched.ok) return sourceStatus("Encuentra24", url, [], fetched.error);

  const $ = cheerio.load(fetched.text);
  const rows = [];

  $("a[href]").each((_, el) => {
    const text = cleanTitle($(el).text());
    if (!text || !/(?:₡|¢)\s*[\d]/.test(text)) return;
    if (!listingMatchesCar(text, spec, { strictYear: false })) return;

    const price = parseFirstCRCPrice(text);
    if (!price || price < 500000) return;

    rows.push(
      carOffer(
        "Encuentra24",
        "particular",
        "Mercado particular",
        {
          title: cleanCarTitle(text, price) || query,
          price,
          url: absoluteUrl($(el).attr("href"), url),
          meta: text,
        },
        spec
      )
    );
  });

  return sourceStatus("Encuentra24", url, dedupeCarOffers(rows).slice(0, 30));
}

async function searchMercadoLibre(query, spec) {
  const apiUrl =
    `https://api.mercadolibre.com/sites/MCR/search?q=${encodeURIComponent(query)}&limit=50`;
  const publicUrl =
    `https://vehiculos.mercadolibre.co.cr/${encodeURIComponent(query).replace(/%20/g, "-")}`;

  const fetched = await fetchJson(apiUrl);
  if (!fetched.ok || !Array.isArray(fetched.data?.results)) {
    return sourceStatus("MercadoLibre", publicUrl, [], fetched.error || "API no disponible");
  }

  const rows = [];

  for (const item of fetched.data.results) {
    const title = cleanTitle(item?.title || "");
    const attrs = Array.isArray(item?.attributes) ? item.attributes : [];
    const attrText = attrs
      .map((x) => `${x?.name || ""} ${x?.value_name || x?.value_id || ""}`)
      .join(" ");
    const combined = `${title} ${attrText}`;

    if (!listingMatchesCar(combined, spec, { strictYear: false })) continue;
    if (item?.currency_id !== "CRC") continue;

    const price = Number(item?.price);
    if (!Number.isFinite(price) || price < 500000) continue;

    const yearAttr = attrs.find((x) =>
      /year|año/i.test(`${x?.id || ""} ${x?.name || ""}`)
    );
    const kmAttr = attrs.find((x) =>
      /kilometer|kilometraje|km/i.test(`${x?.id || ""} ${x?.name || ""}`)
    );

    rows.push(
      carOffer(
        "MercadoLibre",
        "particular",
        "Mercado particular",
        {
          title,
          price: Math.round(price),
          url: item?.permalink || publicUrl,
          year: Number(yearAttr?.value_name || yearAttr?.value_id) || null,
          km: Number(String(kmAttr?.value_name || "").replace(/[^\d]/g, "")) || null,
          meta: attrText,
          condition: item?.condition === "new" ? "Nuevo" : "Usado / consultar",
        },
        spec
      )
    );
  }

  return sourceStatus("MercadoLibre", publicUrl, dedupeCarOffers(rows).slice(0, 30));
}

async function searchCRAutos(query, spec) {
  const url = "https://www.crautos.com/autosusados/";
  const fetched = await fetchText(url);

  if (!fetched.ok) return sourceStatus("CRAutos", url, [], fetched.error);

  const $ = cheerio.load(fetched.text);
  const rows = [];

  $("a[href]").each((_, el) => {
    const box = findCardContainer($, el, 7);
    const text = cleanTitle(box.text());
    if (!text || !listingMatchesCar(text, spec, { strictYear: false })) return;

    const prices = parseCRCPrices(text).filter((x) => x >= 500000);
    if (!prices.length) return;

    const price = Math.min(...prices);

    rows.push(
      carOffer(
        "CRAutos",
        "portal",
        "Portal de autos",
        {
          title: cleanCarTitle(text, price) || query,
          price,
          url: absoluteUrl($(el).attr("href"), url),
          meta: text,
        },
        spec
      )
    );
  });

  return sourceStatus("CRAutos", url, dedupeCarOffers(rows).slice(0, 30));
}

function autoCosmosUrl(spec) {
  if (spec.brand && spec.model) {
    const brand = encodeURIComponent(spec.brand.replace(/\s+/g, "-"));
    const model = encodeURIComponent(spec.model.replace(/\s+/g, "-"));
    return `https://www.autocosmos.cr/auto/listado/${brand}/${model}`;
  }

  return `https://www.autocosmos.cr/auto/listado`;
}

async function searchAutoCosmos(query, spec) {
  const url = autoCosmosUrl(spec);
  const fetched = await fetchText(url);

  if (!fetched.ok) return sourceStatus("AutoCosmos", url, [], fetched.error);

  const $ = cheerio.load(fetched.text);
  const rows = [];

  $("a[href]").each((_, el) => {
    const box = findCardContainer($, el, 8);
    const text = cleanTitle(box.text());

    if (!text || !listingMatchesCar(text, spec, { strictYear: false })) return;

    const prices = parseCRCPrices(text).filter((x) => x >= 500000);
    if (!prices.length) return;

    rows.push(
      carOffer(
        "AutoCosmos",
        "portal",
        "Portal de autos",
        {
          title: cleanCarTitle(text, prices[0]) || query,
          price: Math.min(...prices),
          url: absoluteUrl($(el).attr("href"), url),
          meta: text,
        },
        spec
      )
    );
  });

  return sourceStatus("AutoCosmos", url, dedupeCarOffers(rows).slice(0, 30));
}

async function searchPurdy(query, spec) {
  const base = "https://www.purdyusados.com/autos/usados";
  const urls = [1, 2, 3].map((page) => `${base}?page=${page}`);
  const pages = await Promise.all(urls.map((url) => fetchText(url, 9000)));

  const rows = [];
  let successfulPages = 0;

  for (let i = 0; i < pages.length; i++) {
    const fetched = pages[i];
    if (!fetched.ok) continue;
    successfulPages++;

    const pageUrl = urls[i];
    const $ = cheerio.load(fetched.text);

    $("a[href]").each((_, el) => {
      const box = findCardContainer($, el, 9);
      const text = cleanTitle(box.text());

      if (!text || !listingMatchesCar(text, spec, { strictYear: false })) return;

      const prices = parseCRCPrices(text).filter((x) => x >= 500000);
      if (!prices.length) return;

      rows.push(
        carOffer(
          "Purdy Usados",
          "agencia",
          "Agencia / seminuevos",
          {
            title: cleanCarTitle(text, prices[0]) || query,
            price: Math.min(...prices),
            url: absoluteUrl($(el).attr("href"), pageUrl),
            meta: text,
            condition: "Seminuevo / consultar",
          },
          spec
        )
      );
    });
  }

  return sourceStatus(
    "Purdy Usados",
    base,
    dedupeCarOffers(rows).slice(0, 30),
    successfulPages ? null : "No disponible"
  );
}

function dedupeCarOffers(rows) {
  const seen = new Set();
  const out = [];

  for (const row of rows) {
    const key = [
      row.source,
      row.price,
      row.year || "",
      normalizeText(row.title).slice(0, 80),
      row.url || "",
    ].join("|");

    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }

  return out;
}

async function searchCarSources(query) {
  const spec = parseCarQuery(query);

  const jobs = [
    searchEncuentra24(query, spec),
    searchMercadoLibre(query, spec),
    searchCRAutos(query, spec),
    searchAutoCosmos(query, spec),
    searchPurdy(query, spec),
  ];

  const settled = await Promise.allSettled(jobs);

  const names = [
    "Encuentra24",
    "MercadoLibre",
    "CRAutos",
    "AutoCosmos",
    "Purdy Usados",
  ];

  const sources = settled.map((result, index) => {
    if (result.status === "fulfilled") return result.value;

    const name = names[index];
    return {
      source: name,
      url: "#",
      ok: false,
      count: 0,
      error: "No disponible",
      offers: [],
    };
  });

  let offers = dedupeCarOffers(sources.flatMap((x) => x.offers));

  // Strict year matching is applied here only if the listing exposes a year.
  if (spec.year) {
    offers = offers.filter((offer) => !offer.year || offer.year === spec.year);
  }

  offers = offers
    .filter((offer) => offer.quality >= 55)
    .sort((a, b) => {
      if (b.quality !== a.quality) return b.quality - a.quality;
      return a.price - b.price;
    })
    .slice(0, 100);

  const externalSources = EXTERNAL_SEARCHES.car.map((source) => ({
    name: source.name,
    url: source.buildUrl(query),
    note: source.note,
  }));

  return { spec, offers, sources, externalSources };
}

// -------------------- TECNOLOGÍA --------------------

function walkJsonLd(node, out = []) {
  if (!node) return out;

  if (Array.isArray(node)) {
    for (const item of node) walkJsonLd(item, out);
    return out;
  }

  if (typeof node !== "object") return out;

  if (
    node["@type"] === "Product" ||
    (Array.isArray(node["@type"]) && node["@type"].includes("Product"))
  ) {
    out.push(node);
  }

  for (const value of Object.values(node)) {
    if (value && typeof value === "object") walkJsonLd(value, out);
  }

  return out;
}

function genericTechFromHtml($, source, sourceUrl, query, minPrice) {
  const offers = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const parsed = JSON.parse($(el).contents().text());

      for (const product of walkJsonLd(parsed)) {
        const name = cleanTitle(product?.name || "");
        if (!name || relevance(name, query) < 0.5) continue;

        const candidates = Array.isArray(product?.offers)
          ? product.offers
          : product?.offers
          ? [product.offers]
          : [];

        for (const offer of candidates) {
          const price = Number(
            String(
              offer?.price ??
              offer?.lowPrice ??
              offer?.priceSpecification?.price ??
              ""
            ).replace(/[^\d]/g, "")
          );

          if (!Number.isFinite(price) || price < minPrice) continue;
          if ((offer?.priceCurrency || "CRC") !== "CRC") continue;

          offers.push({
            source,
            title: name,
            price,
            url: absoluteUrl(offer?.url || product?.url || sourceUrl, sourceUrl),
            condition: "Nuevo / consultar",
            meta: "",
          });
        }
      }
    } catch {}
  });

  $("a[href]").each((_, el) => {
    const box = findCardContainer($, el, 8);
    const text = cleanTitle(box.text());
    if (!text || relevance(text, query) < 0.55) return;

    const prices = parseCRCPrices(text).filter((x) => x >= minPrice);
    if (!prices.length) return;

    const title = cleanTitle($(el).text()) || query;

    offers.push({
      source,
      title: title.slice(0, 170),
      price: Math.min(...prices),
      url: absoluteUrl($(el).attr("href"), sourceUrl),
      condition: "Nuevo / consultar",
      meta: "",
    });
  });

  return dedupeGeneric(offers).slice(0, 20);
}

function dedupeGeneric(rows) {
  const seen = new Set();
  const out = [];

  for (const row of rows) {
    const key = `${row.source}|${row.price}|${row.url}|${normalizeText(row.title).slice(0, 80)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }

  return out;
}

async function searchWalmart(query) {
  const source = "Walmart Costa Rica";
  const apiUrl =
    `https://www.walmart.co.cr/api/catalog_system/pub/products/search/` +
    `${encodeURIComponent(query.trim())}?_from=0&_to=49`;
  const publicUrl =
    `https://www.walmart.co.cr/${encodeURIComponent(query.trim())}?_q=${encodeURIComponent(query.trim())}&map=ft`;

  const fetched = await fetchJson(apiUrl);
  if (!fetched.ok || !Array.isArray(fetched.data)) {
    return sourceStatus(source, publicUrl, [], fetched.error || "Catálogo no disponible");
  }

  const offers = [];

  for (const product of fetched.data) {
    const productName = cleanTitle(product?.productName || "");
    if (!productName || relevance(productName, query) < 0.45) continue;

    for (const item of product?.items || []) {
      for (const seller of item?.sellers || []) {
        const commercial = seller?.commertialOffer || seller?.commercialOffer || {};
        const price = Number(commercial?.Price ?? commercial?.price ?? 0);
        const available = Number(commercial?.AvailableQuantity ?? 1);

        if (!Number.isFinite(price) || price < 5000 || available <= 0) continue;

        offers.push({
          source,
          title: cleanTitle(item?.nameComplete || item?.name || productName),
          price: Math.round(price),
          url:
            product?.link ||
            (product?.linkText
              ? `https://www.walmart.co.cr/${product.linkText}/p`
              : publicUrl),
          condition: "Nuevo",
          meta: "",
        });
      }
    }
  }

  return sourceStatus(source, publicUrl, dedupeGeneric(offers).slice(0, 20));
}

async function searchGenericTech(config, query) {
  const url = config.buildUrl(query);
  const fetched = await fetchText(url);

  if (!fetched.ok) return sourceStatus(config.name, url, [], fetched.error);

  const $ = cheerio.load(fetched.text);
  return sourceStatus(
    config.name,
    url,
    genericTechFromHtml($, config.name, url, query, config.minPrice)
  );
}

async function searchTechSources(query) {
  const jobs = [
    searchWalmart(query),
    ...TECH_CONFIG.filter((x) => x.domain !== "walmart.co.cr").map((config) =>
      searchGenericTech(config, query)
    ),
  ];

  const settled = await Promise.allSettled(jobs);
  const names = ["Walmart Costa Rica", "Gollo", "Intelec"];

  const sources = settled.map((result, index) =>
    result.status === "fulfilled"
      ? result.value
      : {
          source: names[index],
          url: "#",
          ok: false,
          count: 0,
          error: "No disponible",
          offers: [],
        }
  );

  const offers = dedupeGeneric(sources.flatMap((x) => x.offers))
    .sort((a, b) => a.price - b.price)
    .slice(0, 60);

  const externalSources = EXTERNAL_SEARCHES.tech.map((source) => ({
    name: source.name,
    url: source.buildUrl(query),
    note: source.note,
  }));

  return { offers, sources, externalSources };
}

export async function searchSources(query, type) {
  if (type === "car") return searchCarSources(query);
  return searchTechSources(query);
}
