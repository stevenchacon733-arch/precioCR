export const products = [
  {
    id: "tucson-2024",
    type: "car",
    name: "Hyundai Tucson 2024",
    category: "Autos",
    image: "🚙",
    summary: "SUV · Automático · Gasolina",
    lowest: 17900000,
    average: 19850000,
    score: 91,
    buyMax: 19000000,
    sellFast: 17400000,
    sellRecommended: 18750000,
    sellMax: 19900000,
    history: [20800000, 20500000, 20100000, 19800000, 19500000, 19200000, 17900000],
    offers: [
      { store: "Encuentra24", price: 17900000, condition: "Usado", meta: "2024 · 22.000 km", rating: "Excelente", source: "Demo" },
      { store: "CR Autos", price: 18900000, condition: "Usado", meta: "2024 · 18.500 km", rating: "Bueno", source: "Demo" },
      { store: "Agencia / distribuidor", price: 21800000, condition: "Nuevo", meta: "Referencia", rating: "Mercado", source: "Demo" }
    ]
  },
  {
    id: "corolla-2021",
    type: "car",
    name: "Toyota Corolla 2021",
    category: "Autos",
    image: "🚗",
    summary: "Sedán · Automático · Gasolina",
    lowest: 10200000,
    average: 11350000,
    score: 88,
    buyMax: 10800000,
    sellFast: 9800000,
    sellRecommended: 10750000,
    sellMax: 11500000,
    history: [12400000, 12100000, 11900000, 11600000, 11400000, 11100000, 10200000],
    offers: [
      { store: "Encuentra24", price: 10200000, condition: "Usado", meta: "2021 · 58.000 km", rating: "Excelente", source: "Demo" },
      { store: "CR Autos", price: 10900000, condition: "Usado", meta: "2021 · 51.000 km", rating: "Bueno", source: "Demo" },
      { store: "Venta particular", price: 11950000, condition: "Usado", meta: "2021 · 43.000 km", rating: "Alto", source: "Demo" }
    ]
  },
  {
    id: "rav4-2022",
    type: "car",
    name: "Toyota RAV4 2022",
    category: "Autos",
    image: "🚘",
    summary: "SUV · Automático · Gasolina",
    lowest: 16800000,
    average: 18150000,
    score: 86,
    buyMax: 17500000,
    sellFast: 16000000,
    sellRecommended: 17250000,
    sellMax: 18400000,
    history: [19500000, 19200000, 18800000, 18500000, 18200000, 17800000, 16800000],
    offers: [
      { store: "CR Autos", price: 16800000, condition: "Usado", meta: "2022 · 44.000 km", rating: "Excelente", source: "Demo" },
      { store: "Encuentra24", price: 17500000, condition: "Usado", meta: "2022 · 39.500 km", rating: "Bueno", source: "Demo" },
      { store: "Venta particular", price: 18900000, condition: "Usado", meta: "2022 · 33.000 km", rating: "Alto", source: "Demo" }
    ]
  },
  {
    id: "iphone-15-128",
    type: "tech",
    name: "iPhone 15 128 GB",
    category: "Tecnología",
    image: "📱",
    summary: "Apple · 128 GB · Nuevo",
    lowest: 349900,
    average: 387450,
    score: 92,
    buyMax: 365000,
    sellFast: 295000,
    sellRecommended: 320000,
    sellMax: 340000,
    history: [419900, 409900, 399900, 389900, 379900, 369900, 349900],
    offers: [
      { store: "Gollo", price: 349900, condition: "Nuevo", meta: "128 GB", rating: "Excelente", source: "Demo" },
      { store: "Walmart", price: 369900, condition: "Nuevo", meta: "128 GB", rating: "Bueno", source: "Demo" },
      { store: "Encuentra24", price: 310000, condition: "Usado", meta: "Buen estado", rating: "Muy bueno", source: "Demo" }
    ]
  },
  {
    id: "ps5-slim",
    type: "tech",
    name: "PlayStation 5 Slim",
    category: "Tecnología",
    image: "🎮",
    summary: "Sony · Slim · Nuevo",
    lowest: 244900,
    average: 278400,
    score: 94,
    buyMax: 260000,
    sellFast: 215000,
    sellRecommended: 239000,
    sellMax: 255000,
    history: [319900, 309900, 299900, 289900, 275000, 259900, 244900],
    offers: [
      { store: "Walmart", price: 244900, condition: "Nuevo", meta: "Edición Slim", rating: "Excelente", source: "Demo" },
      { store: "Gollo", price: 269900, condition: "Nuevo", meta: "Edición Slim", rating: "Bueno", source: "Demo" },
      { store: "Encuentra24", price: 220000, condition: "Usado", meta: "Con control", rating: "Muy bueno", source: "Demo" }
    ]
  },
  {
    id: "macbook-air-m2",
    type: "tech",
    name: "MacBook Air M2 13",
    category: "Tecnología",
    image: "💻",
    summary: "Apple · M2 · 8 GB · 256 GB",
    lowest: 499900,
    average: 559900,
    score: 89,
    buyMax: 520000,
    sellFast: 410000,
    sellRecommended: 460000,
    sellMax: 495000,
    history: [649900, 629900, 599900, 579900, 549900, 529900, 499900],
    offers: [
      { store: "Tienda tecnológica", price: 499900, condition: "Nuevo", meta: "8/256 GB", rating: "Excelente", source: "Demo" },
      { store: "Retail nacional", price: 539900, condition: "Nuevo", meta: "8/256 GB", rating: "Bueno", source: "Demo" },
      { store: "Encuentra24", price: 435000, condition: "Usado", meta: "Buen estado", rating: "Muy bueno", source: "Demo" }
    ]
  }
];

export function money(value) {
  return new Intl.NumberFormat("es-CR", {
    style: "currency",
    currency: "CRC",
    maximumFractionDigits: 0
  }).format(value);
}
