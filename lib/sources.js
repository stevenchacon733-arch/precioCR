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
  // Official Grupo Q Usados CR site. The /resultados page is server-rendered
  // on their Costa Rica inventory platform and prices are commonly in USD.
  const url = "https://grupoqusadoscr.com/index.php/resultados";
  const fetched = await fetchText(url, 9500);

  if (!fetched.ok) {
    return sourceStatus("Grupo Q Usados", "https://grupoqusadoscr.com/", [], fetched.error);
  }

  const $ = cheerio.load(fetched.text);
  const rows = [];

  $("a[href]").each((_, el) => {
    const box = findCardContainer($, el, 10);
    const text = cleanTitle(box.text());
    if (!text || !/\$|USD/i.test(text)) return;

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

  // Fallback for inventories rendered mostly as text blocks.
  if (!rows.length) {
    const body = cleanTitle($("body").text());
    const chunks = body.split(/Planes de Financiamiento|Agregar al carrito/i);

    for (const chunk of chunks) {
      const text = cleanTitle(chunk);
      const offer = agencyOfferFromUsd(
        "Grupo Q Usados",
        text,
        "https://grupoqusadoscr.com/",
        "https://grupoqusadoscr.com/",
        query,
        spec,
        fx
      );
      if (offer) rows.push(offer);
    }
  }

  return sourceStatus(
    "Grupo Q Usados",
    "https://grupoqusadoscr.com/",
    dedupeCarOffers(rows).slice(0, 35),
    fx ? null : "No se pudo obtener tipo de cambio"
  );
}

async function searchQualityMotors(query, spec, fx) {
  const base = "https://qualitymotorsusados.com/";
  const fetched = await fetchText(base, 9500);

  if (!fetched.ok) {
    return sourceStatus("Kia / Quality Motors", base, [], fetched.error);
  }

  const $ = cheerio.load(fetched.text);
  const rows = [];

  $('a[href*="/vehiculos/"]').each((_, el) => {
    const box = findCardContainer($, el, 10);
    const text = cleanTitle(box.text());
    if (!text || !/\$/.test(text)) return;

    const offer = agencyOfferFromUsd(
      "Kia / Quality Motors",
      text,
      $(el).attr("href"),
      base,
      query,
      spec,
      fx
    );
    if (offer) rows.push(offer);
  });

  return sourceStatus(
    "Kia / Quality Motors",
    base,
    dedupeCarOffers(rows).slice(0, 40),
    fx ? null : "No se pudo obtener tipo de cambio"
  );
}

async function searchInchcapeUsed(query, spec, fx) {
  // Suzuki Costa Rica links its certified used-car section directly here.
  // Inchcape's inventory can contain other brands as well, so we search the
  // whole stock and let PrecioCR's model/year filters decide relevance.
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

    $("a[href]").each((_, el) => {
      const text = cleanTitle($(el).text());
      if (!text || !/Precio lista|USD/i.test(text)) return;

      const offer = agencyOfferFromUsd(
        "Suzuki / Inchcape Usados",
        text,
        $(el).attr("href"),
        pageUrl,
        query,
        spec,
        fx
      );
      if (offer) rows.push(offer);
    });
  }

  return sourceStatus(
    "Suzuki / Inchcape Usados",
    urls[0],
    dedupeCarOffers(rows).slice(0, 40),
    okPages ? (fx ? null : "No se pudo obtener tipo de cambio") : "No disponible"
  );
}

async function searchVeinsa(query, spec, fx) {
  // Veinsa Motors' used inventory is actively published through Encuentra24.
  // We filter specifically for the seller keyword "veinsa" plus the user's car.
  const searchTerm = `${query} veinsa`;
  const url =
    `https://www.encuentra24.com/costa-rica-es/autos-usados?q=keyword.${encodeURIComponent(searchTerm)}`;

  const fetched = await fetchText(url, 9500);

  if (!fetched.ok) {
    return sourceStatus("Mitsubishi / Veinsa Usados", url, [], fetched.error);
  }

  const $ = cheerio.load(fetched.text);
  const rows = [];

  $("a[href]").each((_, el) => {
    const text = cleanTitle($(el).text());
    if (!text || !/veinsa/i.test(text)) return;
    if (!listingMatchesCar(text, spec, { strictYear: false })) return;

    // Veinsa listings on Encuentra24 are often published in USD.
    let price = parseFirstCRCPrice(text);
    let originalPrice = null;
    let originalCurrency = null;

    if (!price) {
      const usd = parseUSDPrices(text)[0];
      if (usd) {
        originalPrice = usd;
        originalCurrency = "USD";
        price = usdToCrc(usd, fx);
      }
    }

    if (!price || price < 500000) return;

    rows.push(
      carOffer(
        "Mitsubishi / Veinsa Usados",
        "agencia",
        "Agencia / seminuevos",
        {
          title: cleanCarTitle(text, price) || query,
          price,
          originalPrice,
          originalCurrency,
          fxRate: originalCurrency ? fx?.rate || null : null,
          fxSource: originalCurrency ? fx?.source || null : null,
          url: absoluteUrl($(el).attr("href"), url),
          meta: text,
          condition: "Usado de agencia / consultar",
        },
        spec
      )
    );
  });

  return sourceStatus(
    "Mitsubishi / Veinsa Usados",
    url,
    dedupeCarOffers(rows).slice(0, 35),
    fx || rows.some((x) => x.originalCurrency !== "USD")
      ? null
      : "No se pudo obtener tipo de cambio"
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
    searchMercadoLibre(query, spec),
    searchCRAutos(query, spec),
    searchAutoCosmos(query, spec),
    searchPurdy(query, spec),
    searchGrupoQ(query, spec, fx),
    searchQualityMotors(query, spec, fx),
    searchInchcapeUsed(query, spec, fx),
    searchVeinsa(query, spec, fx),
  ];

  const settled = await Promise.allSettled(jobs);

  const names = [
    "Encuentra24",
    "MercadoLibre",
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
