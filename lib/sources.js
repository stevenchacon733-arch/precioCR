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
      buildUrl: () => "https://crautos.com/autosusados/",
      minPrice: 500000,
    },
  ],
  tech: [
    {
      name: "Walmart Costa Rica",
      domain: "walmart.co.cr",
      buildUrl: (q) =>
        `https://www.walmart.co.cr/search?q=${encodeURIComponent(q)}`,
      minPrice: 5000,
    },
    {
      name: "Gollo",
      domain: "gollo.com",
      buildUrl: (q) =>
        `https://www.gollo.com/catalogsearch/result/?q=${encodeURIComponent(q)}`,
      minPrice: 5000,
    },
    {
      name: "Intelec",
      domain: "intelec.co.cr",
      buildUrl: (q) =>
        `https://www.intelec.co.cr/?s=${encodeURIComponent(q)}&post_type=product`,
      minPrice: 5000,
    },
  ],
};

const EXTERNAL_SEARCHES = {
  car: [
    {
      name: "Facebook Marketplace",
      note: "Requiere iniciar sesión en Facebook",
      buildUrl: (q) =>
        `https://www.facebook.com/marketplace/search/?query=${encodeURIComponent(q)}`,
    },
  ],
  tech: [
    {
      name: "Facebook Marketplace",
      note: "Requiere iniciar sesión en Facebook",
      buildUrl: (q) =>
        `https://www.facebook.com/marketplace/search/?query=${encodeURIComponent(q)}`,
    },
    {
      name: "ExtremeTech",
      note: "Su servidor bloquea consultas automáticas desde Vercel",
      buildUrl: (q) =>
        `https://extremetechcr.com/?s=${encodeURIComponent(q)}&post_type=product`,
    },
    {
      name: "Unimart",
      note: "Su servidor bloquea consultas automáticas desde Vercel",
      buildUrl: (q) =>
        `https://www.unimart.com/search?q=${encodeURIComponent(q)}&type=product`,
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
  // Accept periods, commas, normal spaces, NBSP and thin spaces inside CRC amounts.
  const rx = /(?:₡|¢)\s*([\d][\d.,\s\u00A0\u202F]*)/g;
  let m;
  while ((m = rx.exec(text))) {
    const value = Number(m[1].replace(/[^\d]/g, ""));
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


function parseFirstCRCPrice(text = "") {
  const match = text.match(/(?:₡|¢)\s*([\d][\d.,\s\u00A0\u202F]*)/);
  if (!match) return null;
  const value = Number(match[1].replace(/[^\d]/g, ""));
  return Number.isFinite(value) ? value : null;
}


function fromEncuentra24Text($, source, sourceUrl, query, minPrice) {
  const offers = [];
  const queryYear =
    normalizeText(query).match(/\b(?:19|20)\d{2}\b/)?.[0] || null;

  // Encuentra24 suele envolver cada anuncio completo en un enlace.
  // Tomar SOLO el texto de ese enlace evita mezclar anuncios vecinos.
  $("a[href]").each((_, el) => {
    const card = cleanTitle($(el).text());

    if (!card || card.length < 25) return;
    if (!/(?:₡|¢)\s*[\d]/.test(card)) return;
    if (!/(?:Contactar|Llamar|WhatsApp)/i.test(card)) return;

    // El HTML trae vendedor, provincia y versión; por eso usamos
    // una coincidencia un poco más tolerante que en tiendas.
    if (relevance(card, query) < 0.42) return;

    if (queryYear && !new RegExp(`\\b${queryYear}\\b`).test(card)) return;

    const price = parseFirstCRCPrice(card);
    if (!price || price < minPrice) return;

    const year = card.match(/\b(?:19|20)\d{2}\b/)?.[0] || "";
    const km =
      card.match(/\b[\d.,]{2,9}\s*(?:km|kms|kil[oó]metros)\b/i)?.[0] || "";
    const transmission =
      card.match(/\b(autom[aá]tica|autom[aá]tico|manual|CVT)\b/i)?.[0] || "";

    let title = card
      .replace(/\b\d+\s*\/\s*\d+\s*Previous slideNext slide\b/gi, " ")
      .replace(/\b(Resaltado|Destacado|Oportunidad|Exclusivo|Poco Kilometraje|Poco uso|A estrenar)\b/gi, " ")
      .replace(/(?:Contactar|Llamar|WhatsApp)[\s\S]*$/i, " ")
      .replace(/(?:₡|¢)\s*[\d][\d.,\s\u00A0\u202F]*/g, " ")
      .replace(/-\s*\d{1,2}%/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    // Recorta el texto alrededor de las palabras buscadas para no mostrar
    // descripciones gigantes.
    const qTokens = queryTokens(query);
    const words = title.split(" ");
    const firstHit = words.findIndex((word) =>
      qTokens.some((token) => normalizeText(word).includes(token))
    );

    if (firstHit >= 0) {
      title = words
        .slice(Math.max(0, firstHit - 3), firstHit + 18)
        .join(" ");
    }

    offers.push({
      source,
      title: (title || query).slice(0, 170),
      price,
      url: absoluteUrl($(el).attr("href"), sourceUrl),
      condition: "Usado / consultar",
      meta: [year, km, transmission].filter(Boolean).join(" · "),
    });
  });

  // Fallback si Encuentra24 entrega el HTML aplanado.
  if (!offers.length) {
    const raw = $("body")
      .text()
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const chunks = raw.split(/Contactar\s+Llamar\s+WhatsApp/i);

    for (const chunk of chunks) {
      const card = cleanTitle(chunk);
      if (!card || card.length < 25) continue;
      if (relevance(card, query) < 0.42) continue;
      if (queryYear && !new RegExp(`\\b${queryYear}\\b`).test(card)) continue;

      const price = parseFirstCRCPrice(card);
      if (!price || price < minPrice) continue;

      const year = card.match(/\b(?:19|20)\d{2}\b/)?.[0] || "";
      const km =
        card.match(/\b[\d.,]{2,9}\s*(?:km|kms|kil[oó]metros)\b/i)?.[0] || "";
      const transmission =
        card.match(/\b(autom[aá]tica|autom[aá]tico|manual|CVT)\b/i)?.[0] || "";

      offers.push({
        source,
        title: query,
        price,
        url: sourceUrl,
        condition: "Usado / consultar",
        meta: [year, km, transmission].filter(Boolean).join(" · "),
      });
    }
  }

  return offers;
}

function fromCRAutos($, source, sourceUrl, query, minPrice) {
  const out = [];
  const queryYear = normalizeText(query).match(/\b(19|20)\d{2}\b/)?.[0] || null;

  $("a[href]").each((_, el) => {
    const text = cleanTitle($(el).text());
    if (!text || text.length < 8) return;
    if (relevance(text, query) < 0.55) return;
    if (queryYear && !new RegExp(`\\b${queryYear}\\b`).test(text)) return;

    const price = parseFirstCRCPrice(text);
    if (!price || price < minPrice) return;

    const year = text.match(/\b(?:19|20)\d{2}\b/)?.[0] || "";
    const transmission =
      text.match(/\b(autom[aá]tico|autom[aá]tica|manual|CVT)\b/i)?.[0] || "";
    const meta = [year, transmission].filter(Boolean).join(" · ");

    // El texto del propio enlace suele incluir marca, modelo, año y precio.
    const title = text
      .replace(/(?:₡|¢)\s*[\d.,]+/g, " ")
      .replace(/\$\s*[\d.,]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 150);

    out.push({
      source,
      title: title || query,
      price,
      url: absoluteUrl($(el).attr("href"), sourceUrl),
      condition: "Usado / consultar",
      meta,
    });
  });

  return out;
}


function fromWalmart($, source, sourceUrl, query, minPrice) {
  const results = [];

  // Walmart's cards do not always expose useful JSON-LD on search pages.
  // Product links normally point to URLs ending in /p, so use those as anchors.
  $('a[href*="/p"]').each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;

    let node = $(el);
    let boxText = "";

    // Product name and price can live several wrapper levels above the link.
    for (let i = 0; i < 10; i++) {
      const text = cleanTitle(node.text());
      if (
        text.length >= 12 &&
        text.length <= 2200 &&
        /(?:₡|¢)\s*[\d]/.test(text)
      ) {
        boxText = text;
        break;
      }
      const parent = node.parent();
      if (!parent?.length) break;
      node = parent;
    }

    if (!boxText) return;

    const anchorText = cleanTitle($(el).text());
    const aria =
      cleanTitle($(el).attr("aria-label") || $(el).attr("title") || "");
    const combined = `${anchorText} ${aria} ${boxText}`;

    if (relevance(combined, query) < 0.55) return;

    const prices = parseCRCPrices(boxText).filter((price) => price >= minPrice);
    if (!prices.length) return;

    // Walmart frequently displays regular price + discounted price together.
    // The lowest valid CRC amount on the product card is the current offer price.
    const price = Math.min(...prices);

    let title = anchorText || aria;

    if (!title || relevance(title, query) < 0.5) {
      title = boxText
        .replace(/Vendido por Walmart/gi, " ")
        .replace(/Patrocinado/gi, " ")
        .replace(/(?:₡|¢)\s*[\d][\d.,\s\u00A0\u202F]*/g, " ")
        .replace(/-\s*\d{1,2}%/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    // Keep cards readable if Walmart includes extra UI text.
    if (title.length > 170) {
      const tokens = queryTokens(query);
      const words = title.split(" ");
      const firstHit = words.findIndex((word) =>
        tokens.some((token) => normalizeText(word).includes(token))
      );
      if (firstHit >= 0) {
        title = words
          .slice(Math.max(0, firstHit - 3), firstHit + 18)
          .join(" ");
      }
      title = title.slice(0, 170);
    }

    results.push({
      source,
      title: title || query,
      price,
      url: absoluteUrl(href, sourceUrl),
      condition: "Nuevo / consultar",
      meta: extractMeta(`${title} ${boxText}`, "tech"),
    });
  });

  // Fallback for server-rendered text when Walmart hides card links from the HTML.
  if (!results.length) {
    const raw = cleanTitle($("body").text());
    const chunks = raw.split(/Vendido por Walmart/i);

    for (const chunk of chunks) {
      const text = cleanTitle(chunk);
      if (!text || relevance(text, query) < 0.6) continue;

      const prices = parseCRCPrices(text).filter((price) => price >= minPrice);
      if (!prices.length) continue;

      const price = Math.min(...prices);
      const title = text
        .replace(/Patrocinado/gi, " ")
        .replace(/(?:₡|¢)\s*[\d][\d.,\s\u00A0\u202F]*/g, " ")
        .replace(/-\s*\d{1,2}%/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 170);

      results.push({
        source,
        title: title || query,
        price,
        url: sourceUrl,
        condition: "Nuevo / consultar",
        meta: extractMeta(title, "tech"),
      });
    }
  }

  return results;
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
    const titleKey = normalizeText(item.title || "").slice(0, 100);
    const key = `${item.source}|${item.price}|${titleKey}`;
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

  let offers;
  if (config.domain === "encuentra24.com") {
    offers = [
      ...fromEncuentra24Text(
        $,
        config.name,
        sourceUrl,
        query,
        config.minPrice
      ),
    ];
  } else if (config.domain === "crautos.com") {
    offers = [
      ...fromCRAutos(
        $,
        config.name,
        sourceUrl,
        query,
        config.minPrice
      ),
    ];
  } else if (config.domain === "walmart.co.cr") {
    offers = [
      ...fromJsonLd(
        $,
        config.name,
        sourceUrl,
        query,
        type,
        config.minPrice
      ),
      ...fromWalmart(
        $,
        config.name,
        sourceUrl,
        query,
        config.minPrice
      ),
    ];
  } else {
    offers = [
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
  }

  offers = dedupe(offers)
    .filter((x) =>
      config.domain === "encuentra24.com"
        ? relevance(`${x.title} ${x.meta}`, query) >= 0.32
        : relevance(`${x.title} ${x.meta}`, query) >= 0.5
    )
    .sort((a, b) => a.price - b.price)
    .slice(0, 20);

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

  const externalSources = (EXTERNAL_SEARCHES[type] || []).map((source) => ({
    name: source.name,
    url: source.buildUrl(query),
    note: source.note,
  }));

  return {
    offers: dedupe(sources.flatMap((s) => s.offers))
      .sort((a, b) => a.price - b.price)
      .slice(0, 60),
    sources,
    externalSources,
  };
}
