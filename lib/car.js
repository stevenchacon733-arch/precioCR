export const CAR_BRANDS = [
  "toyota", "hyundai", "kia", "nissan", "honda", "mazda", "suzuki",
  "mitsubishi", "ford", "chevrolet", "volkswagen", "bmw", "mercedes benz",
  "mercedes", "audi", "subaru", "jeep", "land rover", "range rover",
  "lexus", "isuzu", "daihatsu", "geely", "chery", "jac", "byd",
  "peugeot", "renault", "volvo", "mini", "porsche", "fiat", "ram",
  "great wall", "dongfeng", "changan", "jetour", "gac", "mg"
];

const STOP_WORDS = new Set([
  "de", "la", "el", "los", "las", "del", "con", "para",
  "automatico", "automatica", "manual", "cvt", "diesel", "gasolina",
  "hibrido", "hibrida", "4x4", "4wd", "awd", "4x2", "usado", "usada",
  "nuevo", "nueva", "carro", "auto", "vehiculo"
]);

export function normalizeText(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseCarQuery(query = "") {
  const normalized = normalizeText(query);
  const year = normalized.match(/\b(?:19|20)\d{2}\b/)?.[0] || null;

  let brand = null;
  for (const candidate of [...CAR_BRANDS].sort((a, b) => b.length - a.length)) {
    if (normalized.includes(candidate)) {
      brand = candidate;
      break;
    }
  }

  const brandParts = new Set((brand || "").split(" ").filter(Boolean));
  const modelTokens = normalized
    .split(" ")
    .filter(Boolean)
    .filter((token) => token !== year)
    .filter((token) => !brandParts.has(token))
    .filter((token) => !STOP_WORDS.has(token))
    .filter((token) => token.length >= 2);

  return {
    raw: query.trim(),
    normalized,
    brand,
    brandLabel: brand ? brand.replace(/\b\w/g, (c) => c.toUpperCase()) : null,
    model: modelTokens.join(" ").trim() || null,
    modelTokens,
    year: year ? Number(year) : null,
  };
}

export function carQueryLabel(spec) {
  return [spec.brandLabel, spec.model, spec.year].filter(Boolean).join(" ");
}

export function listingMatchesCar(text, spec, { strictYear = true } = {}) {
  const haystack = normalizeText(text);
  if (!haystack) return false;

  if (spec.brand) {
    const brandTokens = spec.brand.split(" ");
    if (!brandTokens.every((t) => haystack.includes(t))) return false;
  }

  if (spec.modelTokens.length) {
    const modelHits = spec.modelTokens.filter((t) => haystack.includes(t)).length;
    const required = spec.modelTokens.length <= 2
      ? spec.modelTokens.length
      : Math.ceil(spec.modelTokens.length * 0.7);
    if (modelHits < required) return false;
  }

  if (strictYear && spec.year) {
    const years = [...haystack.matchAll(/\b(?:19|20)\d{2}\b/g)].map((m) => Number(m[0]));
    if (years.length && !years.includes(spec.year)) return false;
  }

  return true;
}

export function extractYear(text = "") {
  const years = [...String(text).matchAll(/\b(?:19|20)\d{2}\b/g)]
    .map((m) => Number(m[0]))
    .filter((y) => y >= 1980 && y <= 2035);
  return years[0] || null;
}

export function extractKm(text = "") {
  const m = String(text).match(/\b([\d.,]{1,10})\s*(?:km|kms|kil[oó]metros)\b/i);
  if (!m) return null;
  const value = Number(m[1].replace(/[^\d]/g, ""));
  return Number.isFinite(value) ? value : null;
}

export function extractTransmission(text = "") {
  const n = normalizeText(text);
  if (/\b(cvt)\b/.test(n)) return "CVT";
  if (/\b(automatico|automatica)\b/.test(n)) return "Automática";
  if (/\bmanual\b/.test(n)) return "Manual";
  return null;
}

export function extractFuel(text = "") {
  const n = normalizeText(text);
  if (/\b(hibrido|hibrida)\b/.test(n)) return "Híbrido";
  if (/\bdiesel\b/.test(n)) return "Diésel";
  if (/\belectrico\b/.test(n)) return "Eléctrico";
  if (/\bgasolina\b/.test(n)) return "Gasolina";
  return null;
}

export function extractProvince(text = "") {
  const n = normalizeText(text);
  const provinces = [
    ["san jose", "San José"],
    ["alajuela", "Alajuela"],
    ["cartago", "Cartago"],
    ["heredia", "Heredia"],
    ["guanacaste", "Guanacaste"],
    ["puntarenas", "Puntarenas"],
    ["limon", "Limón"],
  ];
  return provinces.find(([key]) => n.includes(key))?.[1] || null;
}

export function qualityForCarListing(offer, spec) {
  let score = 35;
  const text = `${offer.title || ""} ${offer.meta || ""}`;

  if (listingMatchesCar(text, spec, { strictYear: false })) score += 25;
  if (offer.year) score += 10;
  if (spec.year && offer.year === spec.year) score += 15;
  if (offer.km != null) score += 5;
  if (offer.transmission) score += 3;
  if (offer.fuel) score += 2;
  if (offer.url && offer.url.startsWith("http")) score += 5;

  if (spec.year && offer.year && offer.year !== spec.year) score -= 40;
  if (offer.price < 500000) score -= 40;

  return Math.max(0, Math.min(100, score));
}

export function enrichCarOffer(offer, spec) {
  const combined = `${offer.title || ""} ${offer.meta || ""}`;
  const year = offer.year ?? extractYear(combined);
  const km = offer.km ?? extractKm(combined);
  const transmission = offer.transmission ?? extractTransmission(combined);
  const fuel = offer.fuel ?? extractFuel(combined);
  const province = offer.province ?? extractProvince(combined);

  const enriched = {
    ...offer,
    year,
    km,
    transmission,
    fuel,
    province,
  };

  return {
    ...enriched,
    quality: qualityForCarListing(enriched, spec),
  };
}
