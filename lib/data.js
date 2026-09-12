export const products = [
  {
    id: "iphone-15-128",
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
      { store: "Gollo", price: 349900, condition: "Nuevo", rating: "Excelente", source: "Demo" },
      { store: "Walmart", price: 369900, condition: "Nuevo", rating: "Bueno", source: "Demo" },
      { store: "Encuentra24", price: 310000, condition: "Usado", rating: "Muy bueno", source: "Demo" }
    ]
  },
  {
    id: "ps5-slim",
    name: "PlayStation 5 Slim",
    category: "Gaming",
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
      { store: "Walmart", price: 244900, condition: "Nuevo", rating: "Excelente", source: "Demo" },
      { store: "Gollo", price: 269900, condition: "Nuevo", rating: "Bueno", source: "Demo" },
      { store: "Encuentra24", price: 220000, condition: "Usado", rating: "Muy bueno", source: "Demo" }
    ]
  },
  {
    id: "airfryer",
    name: "Freidora de aire 5.5 L",
    category: "Hogar",
    image: "🍟",
    summary: "5.5 L · Digital · Nuevo",
    lowest: 39900,
    average: 51450,
    score: 88,
    buyMax: 45000,
    sellFast: 28000,
    sellRecommended: 35000,
    sellMax: 42000,
    history: [59900, 57900, 54900, 49900, 47900, 44900, 39900],
    offers: [
      { store: "Walmart", price: 39900, condition: "Nuevo", rating: "Excelente", source: "Demo" },
      { store: "Gollo", price: 44900, condition: "Nuevo", rating: "Bueno", source: "Demo" },
      { store: "Encuentra24", price: 30000, condition: "Usado", rating: "Bueno", source: "Demo" }
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
