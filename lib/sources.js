import * as cheerio from "cheerio";
import {
  enrichTechOffer,
  extractStructuredStoreLocations,
  extractWalmartStoreLocations,
  extractRetailerLocationsFromHtml,
  extractGolloDirectoryLocations,
  jsonLdReferences,
  normalizeStoreLocations,
  officialStoreLocationsUrl,
  storeLocationsUrlFromHtml,
  withRetailerLocations,
} from "@/lib/store-locations";
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
  "CRAutos": { group: "portal", label: "Portal de autos" },
  "AutoCosmos": { group: "portal", label: "Portal de autos" },
  "Purdy Usados": { group: "agencia", label: "Agencia / seminuevos" },
  "Grupo Q Usados": { group: "agencia", label: "Agencia / seminuevos" },
  "Kia / Quality Motors": { group: "agencia", label: "Agencia / seminuevos" },
  "Suzuki / Inchcape Usados": { group: "agencia", label: "Agencia / seminuevos" },
  "Mitsubishi / Veinsa Usados": { group: "agencia", label: "Agencia / seminuevos" },
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
  {
    name: "ExtremeTech",
    domain: "extremetechcr.com",
    minPrice: 5000,
    buildUrl: (q) =>
      `https://extremetechcr.com/?s=${encodeURIComponent(q)}&post_type=product`,
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

function normalizeBodyText(value = "") {
  return String(value)
    .replace(/\u00a0|\u202f/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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


function parseLocalizedMoney(raw = "") {
  let value = String(raw).trim().replace(/\s|\u00A0|\u202F/g, "");
  if (!value) return null;

  const hasDot = value.includes(".");
  const hasComma = value.includes(",");

  if (hasDot && hasComma) {
    const lastDot = value.lastIndexOf(".");
    const lastComma = value.lastIndexOf(",");
    const decimalSep = lastDot > lastComma ? "." : ",";
    const thousandsSep = decimalSep === "." ? "," : ".";
    value = value.split(thousandsSep).join("");
    value = value.replace(decimalSep, ".");
  } else if (hasDot || hasComma) {
    const sep = hasDot ? "." : ",";
    const parts = value.split(sep);
    const tail = parts.at(-1) || "";

    if (parts.length > 2 || tail.length === 3) {
      value = parts.join("");
    } else if (tail.length === 2) {
      value = parts.slice(0, -1).join("") + "." + tail;
    } else {
      value = parts.join("");
    }
  }

  const number = Number(value.replace(/[^\d.]/g, ""));
  return Number.isFinite(number) ? number : null;
}

function parseUSDPrices(text = "") {
  const out = [];
  const patterns = [
    /\$\s*([\d][\d.,\s\u00A0\u202F]*)/g,
    /([\d][\d.,\s\u00A0\u202F]*)\s*USD\b/gi,
  ];

  for (const rx of patterns) {
    let match;
    while ((match = rx.exec(text))) {
      const value = parseLocalizedMoney(match[1]);
      if (Number.isFinite(value) && value >= 1000 && value <= 500000) {
        out.push(value);
      }
    }
  }

  return [...new Set(out)];
}

async function fetchUsdToCrcRate() {
  // Public Costa Rican exchange-rate API backed by BCCR data.
  const primary = await fetchJson(
    "https://tipodecambio.cr/api/v1/tipo-cambio/hoy",
    6500
  );

  const venta = Number(primary?.data?.data?.venta);
  if (primary.ok && Number.isFinite(venta) && venta > 300 && venta < 900) {
    return {
      rate: venta,
      source: primary.data?.source || "BCCR",
      date: primary.data?.data?.fecha || null,
    };
  }

  // Fallback so one FX provider outage does not remove all agency prices.
  const fallback = await fetchJson(
    "https://open.er-api.com/v6/latest/USD",
    6500
  );

  const crc = Number(fallback?.data?.rates?.CRC);
  if (fallback.ok && Number.isFinite(crc) && crc > 300 && crc < 900) {
    return {
      rate: crc,
      source: "Open ER-API",
      date: fallback.data?.time_last_update_utc || null,
    };
  }

  return null;
}

function usdToCrc(usd, fx) {
  if (!fx?.rate || !Number.isFinite(Number(usd))) return null;
  return Math.round(Number(usd) * fx.rate);
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
    error: offers.length ? null : error || "Conector OK · sin coincidencias",
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
    const text = normalizeBodyText(node.text());
    if (
      text.length >= 25 &&
      text.length <= 2400 &&
      /(?:₡|¢|\$)\s*[\d]/.test(text)
    ) {
      return node;
    }

    const parent = node.parent();
    if (!parent?.length) break;
    node = parent;
  }

  return $(el);
}


function escapeRegex(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function slugify(value = "") {
  return normalizeText(value)
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function parseCarBlocksFromBody({
  text,
  source,
  sourceGroup,
  sourceGroupLabel,
  url,
  query,
  spec,
  fx = null,
  currency = "CRC",
  maxChars = 500,
}) {
  const rows = [];
  const brand = spec.brandLabel || spec.brand || "";
  const model = spec.model || "";

  if (!brand || !model) return rows;

  const lead = `${escapeRegex(brand)}\\s+${escapeRegex(model)}`;
  const rx = new RegExp(
    `(${lead}[\\s\\S]{0,${maxChars}}?)(?=${lead}|$)`,
    "gi"
  );

  for (const match of text.matchAll(rx)) {
    const block = normalizeBodyText(match[1]);
    if (!listingMatchesCar(block, spec, { strictYear: false })) continue;

    let price = null;
    let originalPrice = null;
    let originalCurrency = null;

    if (currency === "USD") {
      const usdPrices = parseUSDPrices(block);
      if (!usdPrices.length) continue;
      originalPrice = Math.min(...usdPrices);
      originalCurrency = "USD";
      price = usdToCrc(originalPrice, fx);
    } else {
      const prices = parseCRCPrices(block).filter((x) => x >= 500000);
      if (!prices.length) continue;
      price = Math.min(...prices);
    }

    if (!price || price < 500000) continue;

    rows.push(
      carOffer(
        source,
        sourceGroup,
        sourceGroupLabel,
        {
          title: cleanCarTitle(block, currency === "CRC" ? price : null) || query,
          price,
          originalPrice,
          originalCurrency,
          fxRate: originalCurrency ? fx?.rate || null : null,
          fxSource: originalCurrency ? fx?.source || null : null,
          url,
          meta: block,
          condition:
            sourceGroup === "agencia"
              ? "Seminuevo / consultar"
              : "Usado / consultar",
        },
        spec
      )
    );
  }

  return rows;
}



function parsePrepricedUsdBlocks({
  text,
  source,
  sourceGroup,
  sourceGroupLabel,
  url,
  query,
  spec,
  fx,
  maxBefore = 260,
  maxAfter = 420,
}) {
  const rows = [];
  const brand = spec.brandLabel || spec.brand || "";
  const model = spec.model || "";

  if (!brand || !model || !fx?.rate) return rows;

  const lead = `${escapeRegex(brand)}\\s+${escapeRegex(model)}`;
  const rx = new RegExp(
    `(\\$\\s*[\\d.,]+[\\s\\S]{0,${maxBefore}}?${lead}[\\s\\S]{0,${maxAfter}}?)(?=\\$\\s*[\\d.,]+|$)`,
    "gi"
  );

  for (const match of text.matchAll(rx)) {
    const block = normalizeBodyText(match[1]);
    if (!listingMatchesCar(block, spec, { strictYear: false })) continue;

    const usdPrices = parseUSDPrices(block);
    if (!usdPrices.length) continue;

    const originalPrice = Math.min(...usdPrices);
    const price = usdToCrc(originalPrice, fx);
    if (!price || price < 500000) continue;

    rows.push(
      carOffer(
        source,
        sourceGroup,
        sourceGroupLabel,
        {
          title: cleanCarTitle(block, null) || query,
          price,
          originalPrice,
          originalCurrency: "USD",
          fxRate: fx.rate,
          fxSource: fx.source || null,
          url,
          meta: block,
          condition: "Seminuevo / consultar",
        },
        spec
      )
    );
  }

  return rows;
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
    const text = normalizeBodyText($(el).text());
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

async function searchCRAutos(query, spec) {
  const url = "https://www.crautos.com/autosusados/";
  const fetched = await fetchText(url);

  if (!fetched.ok) return sourceStatus("CRAutos", url, [], fetched.error);

  const $ = cheerio.load(fetched.text);
  const rows = [];

  $("a[href]").each((_, el) => {
    const box = findCardContainer($, el, 7);
    const text = normalizeBodyText(box.text());
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

function autoCosmosUrl() {
  return "https://www.autocosmos.cr/auto/usado";
}

async function searchAutoCosmos(query, spec) {
  const url = autoCosmosUrl();
  const fetched = await fetchText(url, 9000);

  if (!fetched.ok) {
    return sourceStatus("AutoCosmos", url, [], fetched.error);
  }

  const $ = cheerio.load(fetched.text);
  const rows = [];

  // First try card/link containers.
  $("a[href]").each((_, el) => {
    const box = findCardContainer($, el, 10);
    const text = normalizeBodyText(box.text());

    if (!text || !listingMatchesCar(text, spec, { strictYear: false })) return;

    const crcPrices = parseCRCPrices(text).filter((x) => x >= 500000);
    if (!crcPrices.length) return;

    rows.push(
      carOffer(
        "AutoCosmos",
        "portal",
        "Portal de autos",
        {
          title: cleanCarTitle(text, Math.min(...crcPrices)) || query,
          price: Math.min(...crcPrices),
          url: absoluteUrl($(el).attr("href"), url),
          meta: text,
        },
        spec
      )
    );
  });

  // Verified fallback: AutoCosmos exposes the inventory in server-rendered body text.
  if (!rows.length) {
    const body = normalizeBodyText($("body").text());

    rows.push(
      ...parseCarBlocksFromBody({
        text: body,
        source: "AutoCosmos",
        sourceGroup: "portal",
        sourceGroupLabel: "Portal de autos",
        url,
        query,
        spec,
        currency: "CRC",
        maxChars: 420,
      })
    );
  }

  const clean = dedupeCarOffers(rows).slice(0, 40);

  return sourceStatus(
    "AutoCosmos",
    url,
    clean,
    clean.length
      ? null
      : spec.year
      ? `Conector OK · sin unidades ${spec.year}`
      : "Conector OK · sin coincidencias"
  );
}

async function searchPurdy(query, spec, fx) {
  const base = "https://www.purdyusados.com/autos/usados";
  const urls = [1, 2, 3, 4, 5].map(
    (page) => `${base}?direction=desc&page=${page}&sort=a.year`
  );

  const pages = await Promise.all(urls.map((url) => fetchText(url, 9500)));
  const rows = [];
  let successfulPages = 0;

  for (let i = 0; i < pages.length; i++) {
    const fetched = pages[i];
    if (!fetched.ok) continue;
    successfulPages++;

    const pageUrl = urls[i];
    const $ = cheerio.load(fetched.text);

    // Structured attempt.
    $("a[href]").each((_, el) => {
      const box = findCardContainer($, el, 12);
      const text = normalizeBodyText(box.text());

      if (!text || !listingMatchesCar(text, spec, { strictYear: false })) return;

      const usdPrices = parseUSDPrices(text);
      if (!usdPrices.length) return;

      const originalPrice = Math.min(...usdPrices);
      const price = usdToCrc(originalPrice, fx);
      if (!price || price < 500000) return;

      rows.push(
        carOffer(
          "Purdy Usados",
          "agencia",
          "Agencia / seminuevos",
          {
            title: cleanCarTitle(text, null) || query,
            price,
            originalPrice,
            originalCurrency: "USD",
            fxRate: fx?.rate || null,
            fxSource: fx?.source || null,
            url: absoluteUrl($(el).attr("href"), pageUrl),
            meta: text,
            condition: "Seminuevo / consultar",
          },
          spec
        )
      );
    });

    // Verified SSR fallback: Purdy often renders price before brand/model.
    const body = normalizeBodyText($("body").text());
    rows.push(
      ...parsePrepricedUsdBlocks({
        text: body,
        source: "Purdy Usados",
        sourceGroup: "agencia",
        sourceGroupLabel: "Agencia / seminuevos",
        url: pageUrl,
        query,
        spec,
        fx,
        maxBefore: 300,
        maxAfter: 520,
      })
    );
  }

  const clean = dedupeCarOffers(rows).slice(0, 60);

  return sourceStatus(
    "Purdy Usados",
    base,
    clean,
    !successfulPages
      ? "No disponible temporalmente"
      : !fx
      ? "No se pudo obtener tipo de cambio"
      : clean.length
      ? null
      : spec.year
      ? `Conector OK · sin unidades ${spec.year}`
      : "Conector OK · sin coincidencias"
  );
}

function agencyOfferFromUsd(
  source,
  text,
  href,
  baseUrl,
  query,
  spec,
  fx,
  options = {}
) {
  if (!listingMatchesCar(text, spec, { strictYear: false })) return null;

  const usdPrices = parseUSDPrices(text);
  if (!usdPrices.length) return null;

  // Prefer the lowest actual sale/list price if regular + sale price are shown.
  const usd = Math.min(...usdPrices);
  const price = usdToCrc(usd, fx);
  if (!price || price < 500000) return null;

  return carOffer(
    source,
    "agencia",
    "Agencia / seminuevos",
    {
      title: cleanCarTitle(text, null) || query,
      price,
      originalPrice: usd,
      originalCurrency: "USD",
      fxRate: fx?.rate || null,
      fxSource: fx?.source || null,
      url: absoluteUrl(href || baseUrl, baseUrl),
      meta: text,
      condition: options.condition || "Seminuevo / consultar",
    },
    spec
  );
}

async function searchGrupoQ(query, spec, fx) {
  // Verified current page: root/index.php exposes "Recién agregados" with prices in USD.
  const url = "https://grupoqusadoscr.com/index.php";
  const fetched = await fetchText(url, 9500);

  if (!fetched.ok) {
    return sourceStatus("Grupo Q Usados", url, [], fetched.error);
  }

  const $ = cheerio.load(fetched.text);
  const rows = [];

  // Links can contain individual recent inventory.
  $("a[href]").each((_, el) => {
    const box = findCardContainer($, el, 10);
    const text = normalizeBodyText(box.text());
    if (!text || !/\\$|USD/i.test(text)) return;

    const offer = agencyOfferFromUsd(
      "Grupo Q Usados",
      text,
      $(el).attr("href"),
      url,
      query,
      spec,
      fx
    );
    if (offer) rows.push(offer);
  });

  // Verified body fallback.
  if (!rows.length) {
    const body = normalizeBodyText($("body").text());

    rows.push(
      ...parseCarBlocksFromBody({
        text: body,
        source: "Grupo Q Usados",
        sourceGroup: "agencia",
        sourceGroupLabel: "Agencia / seminuevos",
        url,
        query,
        spec,
        fx,
        currency: "USD",
        maxChars: 360,
      })
    );
  }

  const clean = dedupeCarOffers(rows).slice(0, 45);

  return sourceStatus(
    "Grupo Q Usados",
    url,
    clean,
    !fx
      ? "No se pudo obtener tipo de cambio"
      : clean.length
      ? null
      : "Conector OK · sin coincidencias en inventario visible"
  );
}

async function searchQualityMotors(query, spec, fx) {
  const base = "https://qualitymotorsusados.com/";
  const inventoryUrl = "https://qualitymotorsusados.com/vehiculos/";
  const rows = [];

  // 1) The homepage is server-rendered and currently exposes featured vehicles
  // with model, year, km, transmission, fuel and USD price.
  const home = await fetchText(base, 9000);

  if (home.ok) {
    const $ = cheerio.load(home.text);
    const body = normalizeBodyText($("body").text());

    const brand = spec.brandLabel || spec.brand || "";
    const model = spec.model || "";

    if (brand && model) {
      const lead = `${escapeRegex(brand)}\\s+${escapeRegex(model)}`;
      const rx = new RegExp(
        `(${lead}[\\s\\S]{0,320}?)(?=\\bVer\\b|${lead}|$)`,
        "gi"
      );

      for (const match of body.matchAll(rx)) {
        const block = normalizeBodyText(match[1]);

        if (!listingMatchesCar(block, spec, { strictYear: false })) continue;

        const usdPrices = parseUSDPrices(block);
        if (!usdPrices.length) continue;

        const originalPrice = Math.min(...usdPrices);
        const price = usdToCrc(originalPrice, fx);
        if (!price || price < 500000) continue;

        rows.push(
          carOffer(
            "Kia / Quality Motors",
            "agencia",
            "Agencia / seminuevos",
            {
              title: cleanCarTitle(block, null) || query,
              price,
              originalPrice,
              originalCurrency: "USD",
              fxRate: fx?.rate || null,
              fxSource: fx?.source || null,
              url: base,
              meta: block,
              condition: "Seminuevo / consultar",
            },
            spec
          )
        );
      }
    }
  }

  // 2) Quality Motors' individual vehicle pages follow a predictable public
  // slug for many models, e.g. /vehiculos/kia-sportage-2023/.
  // If the user supplied a year we test only that year. Otherwise we probe a
  // small recent-year window so searches like "Kia Sportage" can find active
  // listings without relying on the filter UI.
  if (spec.brand && spec.model) {
    const brandSlug = slugify(spec.brand);
    const modelSlug = slugify(spec.model);

    const years = spec.year
      ? [spec.year]
      : Array.from({ length: 11 }, (_, i) => 2026 - i); // 2026..2016

    const urls = years.map(
      (year) =>
        `https://qualitymotorsusados.com/vehiculos/${brandSlug}-${modelSlug}-${year}/`
    );

    const pages = await Promise.all(
      urls.map((url) => fetchText(url, 6500))
    );

    for (let i = 0; i < pages.length; i++) {
      const fetched = pages[i];
      if (!fetched.ok) continue;

      const pageUrl = urls[i];
      const $ = cheerio.load(fetched.text);
      const body = normalizeBodyText($("body").text());

      if (!listingMatchesCar(body, spec, { strictYear: false })) continue;

      const usdPrices = parseUSDPrices(body);
      if (!usdPrices.length) continue;

      // Vehicle detail pages may expose original + discounted price.
      const originalPrice = Math.min(...usdPrices);
      const price = usdToCrc(originalPrice, fx);
      if (!price || price < 500000) continue;

      // Keep only a compact section around the vehicle heading.
      const brand = spec.brandLabel || spec.brand;
      const model = spec.model;
      const leadRx = new RegExp(
        `${escapeRegex(brand)}\\s+${escapeRegex(model)}[\\s\\S]{0,420}`,
        "i"
      );
      const snippet = normalizeBodyText(body.match(leadRx)?.[0] || body.slice(0, 700));

      rows.push(
        carOffer(
          "Kia / Quality Motors",
          "agencia",
          "Agencia / seminuevos",
          {
            title: cleanCarTitle(snippet, null) || query,
            price,
            originalPrice,
            originalCurrency: "USD",
            fxRate: fx?.rate || null,
            fxSource: fx?.source || null,
            url: pageUrl,
            meta: snippet,
            condition: "Seminuevo certificado / consultar",
          },
          spec
        )
      );
    }
  }

  const clean = dedupeCarOffers(rows)
    .filter((offer) => offer.quality >= 55)
    .slice(0, 25);

  return sourceStatus(
    "Kia / Quality Motors",
    inventoryUrl,
    clean,
    !fx
      ? "No se pudo obtener tipo de cambio"
      : clean.length
      ? null
      : "Conector OK · sin coincidencias"
  );
}

async function searchInchcapeUsed(query, spec, fx) {
  const brandParam = spec.brand === "suzuki" ? "?marca=SUZUKI" : "";
  const urls = [
    `https://usados.inchcape.cr/seminuevos${brandParam}`,
    `https://usados.inchcape.cr/seminuevos${brandParam ? brandParam + "&page=2" : "?page=2"}`,
  ];

  const pages = await Promise.all(urls.map((url) => fetchText(url, 9500)));
  const rows = [];
  let okPages = 0;

  for (let i = 0; i < pages.length; i++) {
    const fetched = pages[i];
    if (!fetched.ok) continue;
    okPages++;

    const pageUrl = urls[i];
    const $ = cheerio.load(fetched.text);
    const body = normalizeBodyText($("body").text());

    // Verified format:
    // "Comparar [status] SUZUKI VITARA ... 2024 Precio lista: 23.877,00 USD ..."
    const cardRegex = /Comparar\s+([\s\S]*?)(?=Comparar\s+|SUCURSALES|CONTACTO|$)/gi;

    for (const match of body.matchAll(cardRegex)) {
      const block = normalizeBodyText(match[1]);
      if (!block || /\\bVendido\\b/i.test(block)) continue;
      if (!listingMatchesCar(block, spec, { strictYear: false })) continue;

      const offer = agencyOfferFromUsd(
        "Suzuki / Inchcape Usados",
        block,
        pageUrl,
        pageUrl,
        query,
        spec,
        fx,
        {
          condition: /\\bReservado\\b/i.test(block)
            ? "Reservado / consultar"
            : "Seminuevo / consultar",
        }
      );

      if (offer) rows.push(offer);
    }
  }

  const clean = dedupeCarOffers(rows).slice(0, 60);

  return sourceStatus(
    "Suzuki / Inchcape Usados",
    urls[0],
    clean,
    !okPages
      ? "No disponible temporalmente"
      : !fx
      ? "No se pudo obtener tipo de cambio"
      : clean.length
      ? null
      : spec.year
      ? `Conector OK · sin unidades activas ${spec.year}`
      : "Conector OK · sin unidades activas comparables"
  );
}

async function searchVeinsa(query, spec, fx) {
  // Verified public dealer inventory page for Usados Veinsa Motors.
  // The page can contain sold historical vehicles; those are deliberately excluded.
  const url = "https://www.automoto.cr/es/usados-veinsa-motors";
  const fetched = await fetchText(url, 9500);

  if (!fetched.ok) {
    return sourceStatus("Mitsubishi / Veinsa Usados", url, [], fetched.error);
  }

  const $ = cheerio.load(fetched.text);
  const body = normalizeBodyText($("body").text());
  const rows = [];

  // Split around dealer repetitions and inspect listing-sized sections.
  const chunks = body.split(/Usados Veinsa Motors/i);

  for (const raw of chunks) {
    const block = normalizeBodyText(raw).slice(0, 700);
    if (!block || /\\[Vendido\\]|\\bVendido\\b/i.test(block)) continue;
    if (!listingMatchesCar(block, spec, { strictYear: false })) continue;

    let price = parseFirstCRCPrice(block);
    let originalPrice = null;
    let originalCurrency = null;

    if (!price) {
      const usd = parseUSDPrices(block)[0];
      if (usd) {
        originalPrice = usd;
        originalCurrency = "USD";
        price = usdToCrc(usd, fx);
      }
    }

    if (!price || price < 500000) continue;

    rows.push(
      carOffer(
        "Mitsubishi / Veinsa Usados",
        "agencia",
        "Agencia / seminuevos",
        {
          title: cleanCarTitle(block, price) || query,
          price,
          originalPrice,
          originalCurrency,
          fxRate: originalCurrency ? fx?.rate || null : null,
          fxSource: originalCurrency ? fx?.source || null : null,
          url,
          meta: block,
          condition: "Usado de agencia / consultar",
        },
        spec
      )
    );
  }

  const clean = dedupeCarOffers(rows).slice(0, 30);

  return sourceStatus(
    "Mitsubishi / Veinsa Usados",
    url,
    clean,
    clean.length
      ? null
      : "Conector OK · sin inventario activo comparable"
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
  const fx = await fetchUsdToCrcRate();

  const jobs = [
    searchEncuentra24(query, spec),
    searchCRAutos(query, spec),
    searchAutoCosmos(query, spec),
    searchPurdy(query, spec, fx),
    searchGrupoQ(query, spec, fx),
    searchQualityMotors(query, spec, fx),
    searchInchcapeUsed(query, spec, fx),
    searchVeinsa(query, spec, fx),
  ];

  const settled = await Promise.allSettled(jobs);

  const names = [
    "Encuentra24",
    "CRAutos",
    "AutoCosmos",
    "Purdy Usados",
    "Grupo Q Usados",
    "Kia / Quality Motors",
    "Suzuki / Inchcape Usados",
    "Mitsubishi / Veinsa Usados",
  ];

  const sources = settled.map((result, index) => {
    if (result.status === "fulfilled") return result.value;

    return {
      source: names[index],
      url: "#",
      ok: false,
      count: 0,
      error: "No disponible",
      offers: [],
    };
  });

  let offers = dedupeCarOffers(sources.flatMap((x) => x.offers));

  if (spec.year) {
    offers = offers.filter((offer) => !offer.year || offer.year === spec.year);
  }

  offers = offers
    .filter((offer) => offer.quality >= 55)
    .sort((a, b) => {
      if (b.quality !== a.quality) return b.quality - a.quality;
      return a.price - b.price;
    })
    .slice(0, 140);

  const externalSources = EXTERNAL_SEARCHES.car.map((source) => ({
    name: source.name,
    url: source.buildUrl(query),
    note: source.note,
  }));

  return {
    spec,
    offers,
    sources,
    externalSources,
    fx: fx
      ? {
          usdToCrc: fx.rate,
          source: fx.source,
          date: fx.date,
        }
      : null,
  };
}

// -------------------- TECNOLOGÍA --------------------

function walkJsonLd(root) {
  const out = [];
  const seen = new Set();
  const pending = [{ node: root, depth: 0 }];
  while (pending.length && seen.size < 2500) {
    const { node, depth } = pending.pop();
    if (!node || typeof node !== "object" || seen.has(node) || depth > 16) continue;
    seen.add(node);
    const types = Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]];
    if (types.some((type) => /(?:^|[/#])Product$/.test(type || ""))) out.push(node);
    for (const child of Object.values(node).slice(0, 300)) {
      if (child && typeof child === "object") pending.push({ node: child, depth: depth + 1 });
    }
  }
  return out;
}

function genericTechFromHtml($, source, sourceUrl, query, minPrice) {
  const offers = [];
  const storeLocationsUrl = storeLocationsUrlFromHtml($, sourceUrl);

  $('script[type="application/ld+json"]').slice(0, 40).each((_, el) => {
    try {
      const json = $(el).contents().text();
      if (json.length > 1000000) return;
      const parsed = JSON.parse(json);
      const references = jsonLdReferences(parsed);

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

          offers.push(enrichTechOffer({
            source,
            title: name,
            price,
            url: absoluteUrl(offer?.url || product?.url || sourceUrl, sourceUrl),
            condition: "Nuevo / consultar",
            meta: "",
            storeLocations: extractStructuredStoreLocations(offer, { source, baseUrl: sourceUrl, references }),
            storeLocationsUrl,
          }));
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

    offers.push(enrichTechOffer({
      source,
      title: title.slice(0, 170),
      price: Math.min(...prices),
      url: absoluteUrl($(el).attr("href"), sourceUrl),
      condition: "Nuevo / consultar",
      meta: "",
      storeLocationsUrl,
    }));
  });

  return dedupeGeneric(offers).slice(0, 20);
}

function dedupeGeneric(rows) {
  const seen = new Map();
  const out = [];

  for (const row of rows) {
    const key = `${row.source}|${row.price}|${row.url}|${normalizeText(row.title).slice(0, 80)}`;
    if (seen.has(key)) {
      const existing = seen.get(key);
      existing.storeLocations = normalizeStoreLocations([
        ...(existing.storeLocations || []), ...(row.storeLocations || []),
      ], { source: row.source, baseUrl: row.url });
      Object.assign(existing, enrichTechOffer(existing));
      continue;
    }
    seen.set(key, row);
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

        offers.push(enrichTechOffer({
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
          storeLocations: extractWalmartStoreLocations(seller, commercial, product?.link || publicUrl),
        }));
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


async function techStoreDirectory(source) {
  const url = officialStoreLocationsUrl(source);
  if (!url) return [];
  if (source === "Gollo") {
    const fetched = await fetchJson("https://www.gollo.com/storepickup/index/loadstore/", 5000);
    return fetched.ok ? extractGolloDirectoryLocations(fetched.data) : [];
  }
  const fetched = await fetchText(url, 5000);
  return fetched.ok
    ? extractRetailerLocationsFromHtml(cheerio.load(fetched.text), source, url)
    : [];
}

async function techSourceWithDirectory(task, source) {
  const [result, locations] = await Promise.all([task, techStoreDirectory(source).catch(() => [])]);
  return { ...result, offers: result.offers.map((offer) => withRetailerLocations(offer, locations)) };
}

async function searchTechSources(query) {
  const jobs = [
    techSourceWithDirectory(searchWalmart(query), "Walmart Costa Rica"),
    ...TECH_CONFIG.filter((x) => x.domain !== "walmart.co.cr").map((config) =>
      techSourceWithDirectory(searchGenericTech(config, query), config.name)
    ),
  ];

  const settled = await Promise.allSettled(jobs);
  const names = TECH_CONFIG.map((config) => config.name);

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
