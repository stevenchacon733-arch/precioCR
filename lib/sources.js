import * as cheerio from "cheerio";

const UA =
  "Mozilla/5.0 (compatible; PrecioCR/0.3; +https://precio-cr.vercel.app)";

const SOURCE_CONFIG = {
  car: [
    {
      name: "Encuentra24",
      domain: "encuentra24.com",
      buildUrl: (q) =>
        `https://www.encuentra24.com/costa-rica-es/autos-usados?q=keyword.${encodeURIComponent(q)}`,
      minPrice: 500000,
    },
    {
      name: "CRAutos",
      domain: "crautos.com",
      buildUrl: () => "https://www.crautos.com/autosusados/",
      minPrice: 500000,
    },
  ],
  tech: [
    {
      name: "Walmart Costa Rica",
      domain: "walmart.co.cr",
      buildUrl: (q) =>
        `https://www.walmart.co.cr/search?q=${encodeURIComponent(q)}`,
      minPrice: 10000,
    },
    {
      name: "Gollo",
      domain: "gollo.com",
      buildUrl: (q) =>
        `https://www.gollo.com/catalogsearch/result/?q=${encodeURIComponent(q)}`,
      minPrice: 10000,
    },
  ],
};

function normalizeText(value = "") {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function queryTokens(query) {
  const ignored = new Set([
    "de", "la", "el", "los", "las", "con", "para", "gb", "nuevo", "nueva",
    "usado", "usada", "automatico", "automatica"
  ]);
  return normalizeText(query)
    .split(" ")
    .filter((x) => x.length >= 2 && !ignored.has(x));
}

function relevance(text, query) {
  const tokens = queryTokens(query);
  if (!tokens.length) return 0;
  const haystack = normalizeText(text);
  const hits = tokens.filter((t) => haystack.includes(t)).length;
  return hits / tokens.length;
}

function parseCRCPrices(text = "") {
  const found = [];
  const rx = /(?:₡|¢)\s*([\d][\d.,]*)/g;
  let m;
  while ((m = rx.exec(text))) {
    const value = Number(m[1].replace(/[.,]/g, ""));
    if (Number.isFinite(value)) found.push(value);
  }
  return found;
}

function absoluteUrl(href, base) {
  try {
    return new URL(href, base).toString();
  } catch {
    return base;
  }
}

function cleanTitle(value = "") {
  return value.replace(/\s+/g, " ").trim().slice(0, 180);
}

function extractMeta(text, type) {
  if (type === "car") {
    const year = text.match(/\b(19|20)\d{2}\b/)?.[0];
    const km = text.match(/\b[\d.,]{2,9}\s*(?:km|kms|kil[oó]metros)\b/i)?.[0];
    const transmission = text.match(/\b(autom[aá]tica|manual|dual|CVT)\b/i)?.[0];
    return [year, km, transmission].filter(Boolean).join(" · ");
  }

  const capacity = text.match(/\b(?:64|128|256|512|1024)\s*GB\b/i)?.[0];
  const ram = text.match(/\b(?:4|6|8|12|16|24|32)\s*GB\s*(?:RAM)?\b/i)?.[0];
  return [...new Set([capacity, ram].filter(Boolean))].join(" · ");
}

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

function fromJsonLd($, source, sourceUrl, query, type, minPrice) {
  const offers = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const raw = $(el).contents().text();
      const parsed = JSON.parse(raw);
      for (const product of walkJsonLd(parsed)) {
        const name = cleanTitle(product.name || "");
        if (!name || relevance(name, query) < 0.5) continue;

        const candidates = Array.isArray(product.offers)
          ? product.offers
          : product.offers
          ? [product.offers]
          : [];

        for (const offer of candidates) {
          const rawPrice =
            offer.price ??
            offer.lowPrice ??
            offer.highPrice ??
            offer.priceSpecification?.price;

          let price = Number(String(rawPrice || "").replace(/[^\d]/g, ""));
          if (!Number.isFinite(price) || price < minPrice) continue;

          const currency = offer.priceCurrency || "CRC";
          if (currency !== "CRC" && currency !== "CRC ") continue;

          offers.push({
            source,
            title: name,
            price,
            url: absoluteUrl(
              offer.url || product.url || sourceUrl,
              sourceUrl
            ),
            condition: type === "car" ? "Usado / consultar" : "Consultar",
            meta: extractMeta(name, type),
          });
        }
      }
    } catch {}
  });

  return offers;
}

function smallestUsefulContainer($, anchor) {
  let node = $(anchor);
  for (let i = 0; i < 5; i++) {
    const parent = node.parent();
    if (!parent?.length) break;
    const text = parent.text().replace(/\s+/g, " ").trim();
    if (
      text.length >= 20 &&
      text.length <= 1600 &&
      /(?:₡|¢)\s*[\d]/.test(text)
    ) {
      return parent;
    }
    node = parent;
  }
  return $(anchor).parent();
}

function fromAnchors($, source, sourceUrl, query, type, minPrice) {
  const result = [];

  $("a[href]").each((_, el) => {
    const anchorText = cleanTitle($(el).text());
    if (!anchorText || anchorText.length < 4) return;

    const box = smallestUsefulContainer($, el);
    const boxText = cleanTitle(box.text());
    const combined = `${anchorText} ${boxText}`;

    if (relevance(combined, query) < 0.55) return;

    const prices = parseCRCPrices(boxText).filter((p) => p >= minPrice);
    if (!prices.length) return;

    let price = Math.min(...prices);

    // En tecnología evitamos cuotas mensuales obvias cuando también hay un precio mayor.
    if (type === "tech" && prices.length > 1) {
      const sorted = [...prices].sort((a, b) => b - a);
      if (sorted[0] >= minPrice * 2) price = sorted[0];
    }

    const href = absoluteUrl($(el).attr("href"), sourceUrl);

    result.push({
      source,
      title: anchorText.slice(0, 140),
      price,
      url: href,
      condition: type === "car" ? "Usado / consultar" : "Consultar",
      meta: extractMeta(boxText, type),
    });
  });

  return result;
}

function dedupe(offers) {
  const seen = new Set();
  const out = [];
  for (const item of offers) {
    const key = `${item.source}|${item.url}|${item.price}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

async function fetchHtml(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);

  try {
    const res = await fetch(url, {
      headers: {
        "user-agent": UA,
        "accept-language": "es-CR,es;q=0.9,en;q=0.6",
        accept: "text/html,application/xhtml+xml",
      },
      signal: controller.signal,
      next: { revalidate: 900 },
    });

    const html = await res.text();

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        html: "",
        error: `HTTP ${res.status}`,
      };
    }

    return { ok: true, status: res.status, html, error: null };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      html: "",
      error: error?.name === "AbortError" ? "Tiempo agotado" : "No disponible",
    };
  } finally {
    clearTimeout(timer);
  }
}

async function searchOne(config, query, type) {
  const sourceUrl = config.buildUrl(query);
  const fetched = await fetchHtml(sourceUrl);

  if (!fetched.ok) {
    return {
      source: config.name,
      url: sourceUrl,
      ok: false,
      count: 0,
      error: fetched.error,
      offers: [],
    };
  }

  const $ = cheerio.load(fetched.html);
  let offers = [
    ...fromJsonLd(
      $,
      config.name,
      sourceUrl,
      query,
      type,
      config.minPrice
    ),
    ...fromAnchors(
      $,
      config.name,
      sourceUrl,
      query,
      type,
      config.minPrice
    ),
  ];

  offers = dedupe(offers)
    .filter((x) => relevance(`${x.title} ${x.meta}`, query) >= 0.5)
    .sort((a, b) => a.price - b.price)
    .slice(0, 12);

  return {
    source: config.name,
    url: sourceUrl,
    ok: true,
    count: offers.length,
    error: offers.length ? null : "Sin coincidencias verificables",
    offers,
  };
}

export async function searchSources(query, type) {
  const configs = SOURCE_CONFIG[type] || [];
  const settled = await Promise.allSettled(
    configs.map((config) => searchOne(config, query, type))
  );

  const sources = settled.map((result, i) => {
    if (result.status === "fulfilled") return result.value;
    return {
      source: configs[i]?.name || "Fuente",
      url: configs[i]?.buildUrl(query) || "#",
      ok: false,
      count: 0,
      error: "No disponible",
      offers: [],
    };
  });

  return {
    offers: dedupe(sources.flatMap((s) => s.offers))
      .sort((a, b) => a.price - b.price)
      .slice(0, 30),
    sources,
  };
}
