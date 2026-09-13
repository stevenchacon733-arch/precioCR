// Official directories, checked against the retailers' public sites. A directory
// link identifies branches; it never establishes this product's local inventory.
const STORE_DIRECTORIES = [
  { source: /^walmart(?: costa rica| cr)?$/i, domain: "walmart.co.cr", url: "https://www.walmart.co.cr/localizador-de-tiendas" },
  { source: /^gollo(?: costa rica)?$/i, domain: "gollo.com", url: "https://www.gollo.com/storepickup" },
  { source: /^intelec(?: costa rica)?$/i, domain: "intelec.co.cr", url: "https://www.intelec.co.cr/tiendas/" },
];

const MAX_LOCATIONS = 60;

function clean(value, limit = 240) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, limit) : "";
}

function normalized(value) {
  return clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function list(value) {
  return Array.isArray(value) ? value.slice(0, MAX_LOCATIONS) : value ? [value] : [];
}

function safeUrl(value, baseUrl) {
  if (!clean(value, 2000)) return undefined;
  try {
    const url = new URL(value, baseUrl);
    return /^https?:$/.test(url.protocol) && !url.username && !url.password ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function availability(value) {
  const state = normalized(value).split(/[\/#]/).at(-1);
  if (["available", "instock", "limitedavailability", "instoreonly"].includes(state)) return "available";
  if (["unavailable", "outofstock", "soldout", "discontinued"].includes(state)) return "unavailable";
  return "unknown";
}

function addressInfo(value) {
  if (typeof value === "string") return { address: clean(value) };
  if (!value || typeof value !== "object") return {};
  const province = clean(value.addressRegion || value.state, 80);
  const address = [...new Set([
    clean(value.streetAddress || value.street),
    clean(value.addressLocality || value.city, 100),
    province,
  ].filter(Boolean))].join(", ");
  return { address, province };
}

function locationFromPlace(place, { source, baseUrl, state = "unknown" } = {}) {
  if (typeof place === "string") {
    // An unresolved @id / URL or a chain name alone is not a physical branch.
    if (/^(?:https?:|#|urn:)/i.test(place)) return null;
    place = { name: place };
  }
  if (!place || typeof place !== "object") return null;
  const { address, province } = addressInfo(place.address);
  const name = clean(place.name || place.storeName, 120) || address;
  if (!name || /\b(?:online|en linea|ecommerce|e-commerce|marketplace)\b/.test(normalized(name))) return null;
  if (!address && [normalized(source), "walmart", "walmart cr", "walmart costa rica", "gollo", "intelec", "costa rica"].includes(normalized(name))) return null;
  return {
    name,
    ...(address ? { address } : {}),
    ...(province || clean(place.province, 80) ? { province: province || clean(place.province, 80) } : {}),
    availability: availability(place.availability || state),
    ...(safeUrl(place.url, baseUrl) ? { url: safeUrl(place.url, baseUrl) } : {}),
  };
}

export function normalizeStoreLocations(locations = [], options = {}) {
  const found = new Map();
  const conflicts = new Set();
  for (const raw of list(locations)) {
    const location = locationFromPlace(raw, options);
    if (!location) continue;
    const key = normalized(`${location.name}|${location.address || ""}`);
    const existing = found.get(key);
    if (!existing) found.set(key, location);
    else if (existing.availability === "unknown" && !conflicts.has(key)) found.set(key, { ...existing, ...location });
    else if (location.availability !== "unknown" && location.availability !== existing.availability) {
      // Conflicting source observations cannot establish current stock.
      conflicts.add(key);
      found.set(key, { ...existing, availability: "unknown" });
    }
  }
  return [...found.values()];
}

// Only follow references already present in the supplied JSON-LD document.
// Bounded traversal also tolerates cyclic test/input objects and large graphs.
export function jsonLdReferences(document) {
  const refs = new Map();
  const visited = new Set();
  const pending = [{ node: document, depth: 0 }];
  while (pending.length && visited.size < 2500) {
    const { node, depth } = pending.pop();
    if (!node || typeof node !== "object" || visited.has(node) || depth > 16) continue;
    visited.add(node);
    if (typeof node["@id"] === "string" && Object.keys(node).length > 1) refs.set(node["@id"], node);
    for (const child of Object.values(node).slice(0, 300)) {
      if (child && typeof child === "object") pending.push({ node: child, depth: depth + 1 });
    }
  }
  return refs;
}

export function extractStructuredStoreLocations(offer, { source, baseUrl, references = new Map() } = {}) {
  if (!offer || typeof offer !== "object") return [];
  const resolve = (value) => {
    if (typeof value === "string") return references.get(value) || value;
    return value?.["@id"] && references.has(value["@id"])
      ? { ...references.get(value["@id"]), ...value }
      : value;
  };
  const resolvePlace = (value) => {
    const place = resolve(value);
    return place && typeof place === "object" ? { ...place, address: resolve(place.address) } : place;
  };
  const rows = list(offer.availableAtOrFrom).map((value) =>
    locationFromPlace(resolvePlace(value), { source, baseUrl, state: offer.availability })
  );
  // Seller addresses describe where to contact the seller. Online InStock does
  // not prove inventory at that address, so seller locations remain unconfirmed.
  for (const value of list(offer.seller || offer.offeredBy)) {
    const seller = resolvePlace(value);
    const types = list(seller?.["@type"]).map((type) => clean(type).split(/[\/#]/).at(-1));
    if (!types.some((type) => /^(?:Store|LocalBusiness|ElectronicsStore|DepartmentStore|ComputerStore)$/.test(type))) continue;
    if (seller?.address) rows.push(locationFromPlace({ ...seller, availability: "unknown" }, { source, baseUrl }));
  }
  return normalizeStoreLocations(rows.filter(Boolean), { source, baseUrl });
}

export function extractWalmartStoreLocations(seller = {}, commercial = {}, baseUrl) {
  const source = "Walmart Costa Rica";
  const direct = extractStructuredStoreLocations({
    availableAtOrFrom: commercial.availableAtOrFrom || seller.availableAtOrFrom,
    availability: commercial.availability,
  }, { source, baseUrl });
  // VTEX seller IDs and AvailableQuantity usually represent online stock. Only
  // accept a named location/address; never translate opaque IDs into branches.
  const places = list(seller.location).map((place) =>
    locationFromPlace(place, { source, baseUrl })
  );
  if (seller.address) places.push(locationFromPlace({ name: seller.sellerName, address: seller.address }, { source, baseUrl }));
  return normalizeStoreLocations([...direct, ...places.filter(Boolean)], { source, baseUrl });
}

export function officialStoreLocationsUrl(source, offerUrl) {
  let host = "";
  try { host = new URL(offerUrl).hostname.toLowerCase(); } catch {}
  return STORE_DIRECTORIES.find((entry) =>
    entry.source.test(clean(source)) || host === entry.domain || host.endsWith(`.${entry.domain}`)
  )?.url;
}

// Read the retailer's actual directory link instead of guessing its route.
export function storeLocationsUrlFromHtml($, sourceUrl) {
  let found;
  let host;
  try { host = new URL(sourceUrl).hostname.replace(/^www\./, ""); } catch { return undefined; }
  $("a[href]").each((_, el) => {
    if (found) return;
    const label = normalized($(el).text());
    if (!/^(?:tiendas|nuestras tiendas|sucursales|nuestras sucursales|localizador de tiendas|encontra tu tienda)$/.test(label)) return;
    const url = safeUrl($(el).attr("href"), sourceUrl);
    if (!url) return;
    const parsed = new URL(url);
    if (parsed.hostname.replace(/^www\./, "") !== host || parsed.pathname === "/") return;
    found = url;
  });
  return found;
}

export function extractRetailerLocationsFromHtml($, source, sourceUrl) {
  const rows = [];
  if (/walmart/i.test(source)) {
    // Walmart's locator publishes the CR branch directory in plain JSON VTEX
    // blocks. The storesArr fields are directory data, not stock observations.
    $("script").slice(0, 100).each((_, el) => {
      const json = $(el).text();
      if (json.length > 1000000 || !json.includes('"storesArr"')) return;
      try {
        const blocks = JSON.parse(json);
        for (const block of Object.values(blocks).slice(0, 1500)) {
          if (block?.props?.country !== "CRI" || !Array.isArray(block.props.storesArr)) continue;
          for (const store of block.props.storesArr.slice(0, MAX_LOCATIONS)) {
            if (!clean(store.name) || !clean(store.address)) continue;
            rows.push({ name: `Walmart ${clean(store.name, 100)}`, address: clean(store.address), province: clean(store.provincia, 80), url: sourceUrl, availability: "unknown" });
          }
        }
      } catch {}
    });
  } else if (/intelec/i.test(source)) {
    $("a.store-card[href]").slice(0, MAX_LOCATIONS).each((_, el) => {
      const name = clean($(el).find("h3").first().text(), 100);
      const url = safeUrl($(el).attr("href"), sourceUrl);
      if (!name || !url || !/^https:\/\/(?:www\.)?intelec\.co\.cr\//.test(url)) return;
      rows.push({ name: `Intelec ${name}`, url, availability: "unknown" });
    });
  }
  return normalizeStoreLocations(rows, { source, baseUrl: sourceUrl });
}

export function extractGolloDirectoryLocations(data) {
  if (!Array.isArray(data?.storesjson)) return [];
  return normalizeStoreLocations(data.storesjson.slice(0, MAX_LOCATIONS)
    .filter((store) => clean(store.store_name) && clean(store.address))
    .map((store) => ({
      name: `Gollo ${clean(store.store_name, 100)}`,
      address: clean(store.address),
      // The directory API is paginated; the official directory exposes all pages.
      url: "https://www.gollo.com/storepickup",
      availability: "unknown",
    })), { source: "Gollo" });
}

export function withRetailerLocations(offer, locations) {
  if (offer.storeLocations?.length || !locations?.length) return enrichTechOffer(offer);
  return enrichTechOffer({ ...offer, storeLocations: locations, storeLocationsScope: "retailer" });
}

export function enrichTechOffer(offer) {
  const retailer = offer.storeLocationsScope === "retailer";
  const storeLocations = normalizeStoreLocations(offer.storeLocations, { source: offer.source, baseUrl: offer.url })
    .map((location) => retailer ? { ...location, availability: "unknown" } : location);
  const storeLocationsScope = storeLocations.length ? retailer ? "retailer" : "product" : undefined;
  const storeLocationsUrl = safeUrl(offer.storeLocationsUrl) || officialStoreLocationsUrl(offer.source, offer.url);
  const locationNote = retailer && storeLocations.length
    ? "Locales de la cadena; consultá disponibilidad de este producto."
    : storeLocations.length
    ? storeLocations.some((location) => location.availability === "unknown")
      ? "Ubicaciones publicadas; confirmá existencias en la sucursal."
      : "Disponibilidad publicada por la tienda; puede cambiar."
    : "Sin información de existencias por sucursal para este producto.";
  return { ...offer, storeLocations, storeLocationsScope, storeLocationsUrl, locationNote };
}
