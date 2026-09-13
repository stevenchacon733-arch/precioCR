export const COSTA_RICA_PROVINCES = [
  "San José", "Alajuela", "Cartago", "Heredia", "Guanacaste", "Puntarenas", "Limón",
];

function normalizeLocation(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeProvince(value) {
  const normalized = normalizeLocation(value);
  return COSTA_RICA_PROVINCES.find(
    (province) => normalizeLocation(province) === normalized
  ) || null;
}

export function provinceFromText(value) {
  const text = ` ${normalizeLocation(value)} `;
  const matches = COSTA_RICA_PROVINCES.filter(
    (province) => text.includes(` ${normalizeLocation(province)} `)
  );
  // A list of branches or nationwide delivery areas is not a vehicle location.
  return matches.length === 1 ? matches[0] : null;
}

export function filterCarOffersByProvince(offers, province = null) {
  const selected = normalizeProvince(province);
  const normalized = offers.map((offer) => ({
    ...offer,
    province: normalizeProvince(offer.province) || provinceFromText(offer.province),
  }));
  const filtered = selected
    ? normalized.filter((offer) => offer.province === selected)
    : normalized;

  return {
    offers: filtered,
    locationFilter: {
      province: selected,
      totalCount: normalized.length,
      matchedCount: filtered.length,
      unknownCount: normalized.filter((offer) => !offer.province).length,
    },
  };
}

export function sourcesForFilteredOffers(sources, offers, province) {
  return sources.map((source) => {
    const matched = offers.filter((offer) => offer.source === source.source);
    return {
      ...source,
      count: matched.length,
      offers: matched,
      error: matched.length
        ? null
        : source.ok
        ? `Conector OK · sin coincidencias${province ? ` en ${province}` : ""}`
        : source.error,
    };
  });
}
