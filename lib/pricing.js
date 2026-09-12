export function percentile(sorted, p) {
  if (!sorted.length) return null;
  const index = (sorted.length - 1) * p;
  const low = Math.floor(index);
  const high = Math.ceil(index);
  if (low === high) return sorted[low];
  return Math.round(
    sorted[low] + (sorted[high] - sorted[low]) * (index - low)
  );
}

export function summarizePrices(offers) {
  const prices = offers
    .map((o) => Number(o.price))
    .filter((p) => Number.isFinite(p) && p > 0)
    .sort((a, b) => a - b);

  if (!prices.length) {
    return {
      count: 0,
      lowest: null,
      median: null,
      average: null,
      buyTarget: null,
      sellRecommended: null,
      score: null,
      confidence: "Sin datos",
    };
  }

  const sum = prices.reduce((a, b) => a + b, 0);
  const average = Math.round(sum / prices.length);
  const median = percentile(prices, 0.5);
  const q1 = percentile(prices, 0.25);
  const q3 = percentile(prices, 0.75);

  const lowest = prices[0];
  const buyTarget = prices.length >= 3 ? q1 : Math.round(median * 0.97);
  const sellRecommended = prices.length >= 3 ? median : average;

  const discount = median ? Math.max(0, (median - lowest) / median) : 0;
  const spread = median ? Math.max(0, (q3 - q1) / median) : 0;

  let score = Math.round(72 + discount * 110 - spread * 20);
  score = Math.max(45, Math.min(98, score));

  const confidence =
    prices.length >= 6 ? "Alta" : prices.length >= 3 ? "Media" : "Baja";

  return {
    count: prices.length,
    lowest,
    median,
    average,
    buyTarget,
    sellRecommended,
    q1,
    q3,
    score,
    confidence,
  };
}
