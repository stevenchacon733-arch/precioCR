import test from "node:test";
import assert from "node:assert/strict";
import {
  COSTA_RICA_PROVINCES,
  normalizeProvince,
  provinceFromText,
  filterCarOffersByProvince,
  sourcesForFilteredOffers,
} from "../lib/location.js";
import { enrichCarOffer, parseCarQuery } from "../lib/car.js";
import { analyzeCarMarket } from "../lib/pricing.js";

const spec = parseCarQuery("Toyota Corolla 2021");
const offers = [
  { source: "Portal", province: "San José", price: 10000000 },
  { source: "Portal", province: "HEREDIA", price: 12000000 },
  { source: "Base PrecioCR", province: "san jose", price: 11000000, dataOrigin: "database" },
  { source: "Portal", province: null, price: 8000000 },
].map((offer) => enrichCarOffer({ title: "Toyota Corolla 2021", ...offer }, spec));

test("las siete provincias se normalizan sin exigir tildes", () => {
  assert.equal(COSTA_RICA_PROVINCES.length, 7);
  assert.equal(normalizeProvince("  SAN JOSE "), "San José");
  assert.equal(normalizeProvince("limon"), "Limón");
  assert.equal(normalizeProvince("San José o Heredia"), null);
  assert.equal(normalizeProvince(""), null);
});

test("extracción evita palabras parciales y ubicaciones ambiguas", () => {
  assert.equal(provinceFromText("Ubicación: San José, Escazú"), "San José");
  assert.equal(provinceFromText("Color limoncillo"), null);
  assert.equal(provinceFromText("Sucursales en San José, Heredia y Alajuela"), null);
  assert.equal(provinceFromText(""), null);
});

test("provincia explícita tiene prioridad y se conserva texto posterior al título", () => {
  assert.equal(enrichCarOffer({ title: "Toyota Corolla 2021", province: "HEREDIA", meta: "Contacto San José" }, spec).province, "Heredia");
  assert.equal(enrichCarOffer({ title: "Toyota Corolla 2021", meta: `${"Descripción del vehículo. ".repeat(20)} Ubicación: Cartago` }, spec).province, "Cartago");
});

test("sin filtro se incluyen anuncios con ubicación desconocida", () => {
  const result = filterCarOffersByProvince(offers);
  assert.equal(result.offers.length, 4);
  assert.deepEqual(result.locationFilter, { province: null, totalCount: 4, matchedCount: 4, unknownCount: 1 });
});

test("el filtro se aplica por igual a fuentes automáticas y base de datos", () => {
  const result = filterCarOffersByProvince(offers, "san jose");
  assert.equal(result.offers.length, 2);
  assert.ok(result.offers.every((offer) => offer.province === "San José"));
  assert.ok(result.offers.some((offer) => offer.dataOrigin === "database"));
  assert.equal(result.locationFilter.unknownCount, 1);
  assert.equal(offers.length, 4);
});

test("estadísticas y conteos solo usan los vehículos de la provincia elegida", () => {
  const filtered = filterCarOffersByProvince(offers, "San José").offers;
  const stats = analyzeCarMarket(filtered, spec);
  assert.equal(stats.rawCount, 2);
  assert.equal(stats.lowest, 10000000);
  assert.equal(stats.average, 10500000);
  const sources = sourcesForFilteredOffers([
    { source: "Portal", ok: true, offers, count: 4 },
    { source: "Base PrecioCR", ok: true },
    { source: "Sin conexión", ok: false, error: "Tiempo agotado" },
  ], filtered, "San José");
  assert.equal(sources[0].count, 1);
  assert.equal(sources[1].count, 1);
  assert.equal(sources[2].error, "Tiempo agotado");
});

test("provincia sin resultados no reutiliza precios nacionales ni falla la fuente", () => {
  const filtered = filterCarOffersByProvince(offers, "Limón").offers;
  const stats = analyzeCarMarket(filtered, spec);
  assert.equal(stats.lowest, null);
  assert.equal(stats.average, null);
  assert.equal(stats.rawCount, 0);
  const sources = sourcesForFilteredOffers([{ source: "Portal", ok: true, count: 4 }], filtered, "Limón");
  assert.equal(sources[0].count, 0);
  assert.match(sources[0].error, /^Conector OK/);
});
