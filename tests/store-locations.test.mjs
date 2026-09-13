import test from "node:test";
import assert from "node:assert/strict";
import {
  enrichTechOffer,
  extractStructuredStoreLocations,
  extractWalmartStoreLocations,
  jsonLdReferences,
  normalizeStoreLocations,
  officialStoreLocationsUrl,
} from "../lib/store-locations.js";

const options = { source: "Intelec", baseUrl: "https://www.intelec.co.cr/producto/" };

test("product-linked JSON-LD locations retain address and explicit availability", () => {
  const locations = extractStructuredStoreLocations({
    availability: "https://schema.org/InStock",
    availableAtOrFrom: [
      { name: "Sucursal Cartago", address: { streetAddress: "Calle 1", addressLocality: "Cartago", addressRegion: "Cartago" }, url: "/tienda-cartago/" },
      { name: "Sucursal Heredia", availability: "https://schema.org/OutOfStock" },
    ],
  }, options);
  assert.deepEqual(locations, [
    { name: "Sucursal Cartago", address: "Calle 1, Cartago", province: "Cartago", availability: "available", url: "https://www.intelec.co.cr/tienda-cartago/" },
    { name: "Sucursal Heredia", availability: "unavailable" },
  ]);
});

test("JSON-LD resolves only product-linked store/address references", () => {
  const graph = { "@graph": [
    { "@id": "#branch", "@type": "Store", name: "Sucursal Alajuela", address: { "@id": "#address" } },
    { "@id": "#address", "@type": "PostalAddress", streetAddress: "Calle Central", addressRegion: "Alajuela" },
    { "@id": "#unrelated", "@type": "Store", name: "Sucursal Liberia" },
  ] };
  const references = jsonLdReferences(graph);
  const rows = extractStructuredStoreLocations({ availableAtOrFrom: { "@id": "#branch" } }, { ...options, references });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "Sucursal Alajuela");
  assert.equal(rows[0].province, "Alajuela");
  assert.equal(rows[0].availability, "unknown");
  assert.deepEqual(extractStructuredStoreLocations({ availableAtOrFrom: { "@id": "#missing" } }, { ...options, references }), []);
});

test("seller address never inherits a product's online stock", () => {
  const seller = { "@type": "ElectronicsStore", name: "Sucursal San José", address: { addressLocality: "San José" } };
  const rows = extractStructuredStoreLocations({ seller, availability: "https://schema.org/InStock" }, options);
  assert.equal(rows[0].availability, "unknown");
  assert.deepEqual(extractStructuredStoreLocations({ seller: { ...seller, "@type": "Organization" }, availability: "https://schema.org/InStock" }, options), []);
});

test("live Walmart catalogue structure does not manufacture branches from online stock", () => {
  // Relevant fields observed in public products/search/samsung on 2026-09-12.
  const seller = { sellerId: "1", sellerName: "Walmart Cr", sellerDefault: true };
  const commercial = {
    Price: 218405,
    AvailableQuantity: 100,
    IsAvailable: true,
    DeliverySlaSamplesPerRegion: { "0": { DeliverySlaPerTypes: [], Region: null } },
    DeliverySlaSamples: [{ DeliverySlaPerTypes: [], Region: null }],
  };
  assert.deepEqual(extractWalmartStoreLocations(seller, commercial, "https://www.walmart.co.cr/"), []);
  const enriched = enrichTechOffer({ source: "Walmart Costa Rica", storeLocations: [], url: "https://www.walmart.co.cr/samsung/p" });
  assert.equal(enriched.storeLocations.length, 0);
  assert.equal(enriched.storeLocationsUrl, "https://www.walmart.co.cr/localizador-de-tiendas");
});

test("Walmart explicit seller location stays unconfirmed despite online quantity", () => {
  const rows = extractWalmartStoreLocations({ sellerName: "Walmart", location: { name: "Walmart Heredia", address: { addressRegion: "Heredia" } } }, { AvailableQuantity: 100 });
  assert.equal(rows[0].name, "Walmart Heredia");
  assert.equal(rows[0].availability, "unknown");
});

test("generic chain names, unresolved URLs and virtual stores are not branches", () => {
  assert.deepEqual(normalizeStoreLocations(["Walmart Cr", "Costa Rica", "https://example.com/store", "#store", "Walmart Online", { "@id": "#missing" }, null], { source: "Walmart Costa Rica" }), []);
});

test("only safe location links survive enrichment", () => {
  const locations = normalizeStoreLocations([
    { name: "Sucursal Cartago", url: "javascript:alert(1)" },
    { name: "Sucursal Heredia", url: "https://user:pass@example.com/" },
    { name: "Sucursal Liberia", url: "https://www.intelec.co.cr/tiendas/" },
  ]);
  assert.equal(locations[0].url, undefined);
  assert.equal(locations[1].url, undefined);
  assert.equal(locations[2].url, "https://www.intelec.co.cr/tiendas/");
});

test("duplicates merge locations and conflicting availability stays unconfirmed", () => {
  const rows = normalizeStoreLocations([
    { name: "Sucursal San José", availability: "available" },
    { name: "Sucursal San Jose", availability: "unavailable" },
    { name: "Sucursal San José", availability: "available" },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].availability, "unknown");
});

test("directory matching supports known sources and exact official hosts", () => {
  assert.equal(officialStoreLocationsUrl("Gollo"), "https://www.gollo.com/storepickup");
  assert.equal(officialStoreLocationsUrl("Tienda", "https://www.intelec.co.cr/producto/"), "https://www.intelec.co.cr/tiendas/");
  assert.equal(officialStoreLocationsUrl("Tienda", "https://intelec.co.cr.example.com/producto/"), undefined);
  assert.equal(officialStoreLocationsUrl("Desconocida", "https://example.com/"), undefined);
});

test("structured graph parsing and output remain bounded", () => {
  const cyclic = { "@id": "#store", name: "Sucursal" };
  cyclic.self = cyclic;
  assert.equal(jsonLdReferences(cyclic).size, 1);
  assert.equal(normalizeStoreLocations(Array.from({ length: 1000 }, (_, index) => ({ name: `Sucursal ${index}` }))).length, 60);
});
