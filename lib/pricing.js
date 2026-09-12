function sortedNumbers(values) {
  return values
    .map(Number)
    .filter((x) => Number.isFinite(x) && x > 0)
    .sort((a, b) => a - b);
}

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

export function median(values) {
  return percentile(sortedNumbers(values), 0.5);
}

function weightOf(offer) {
  const weight = Number(offer?.freshnessWeight ?? 1);
  return Number.isFinite(weight) ? Math.max(0, weight) : 1;
}

function weightedMedian(rows) {
  const values = rows
    .map((row) => ({
      value: Number(row.price),
      weight: weightOf(row),
    }))
    .filter((row) => Number.isFinite(row.value) && row.value > 0 && row.weight > 0)
    .sort((a, b) => a.value - b.value);

  if (!values.length) return null;

  const totalWeight = values.reduce((sum, row) => sum + row.weight, 0);
  let running = 0;

  for (const row of values) {
    running += row.weight;
    if (running >= totalWeight / 2) return Math.round(row.value);
  }

  return Math.round(values.at(-1).value);
}

function weightedAverage(rows) {
  const valid = rows.filter(
    (row) =>
      Number.isFinite(Number(row.price)) &&
      Number(row.price) > 0 &&
      weightOf(row) > 0
  );

  if (!valid.length) return null;

  const totalWeight = valid.reduce((sum, row) => sum + weightOf(row), 0);
  const total = valid.reduce(
    (sum, row) => sum + Number(row.price) * weightOf(row),
    0
  );

  return Math.round(total / totalWeight);
}

function removePriceOutliers(offers) {
  if (offers.length < 5) return offers;

  const prices = sortedNumbers(offers.map((x) => x.price));
  const q1 = percentile(prices, 0.25);
  const q3 = percentile(prices, 0.75);
  const iqr = Math.max(1, q3 - q1);

  const low = Math.max(500000, q1 - 1.75 * iqr);
  const high = q3 + 1.75 * iqr;

  return offers.filter((x) => x.price >= low && x.price <= high);
}

function sourceBalancedMedian(offers) {
  const bySource = new Map();

  for (const offer of offers) {
    if (!bySource.has(offer.source)) bySource.set(offer.source, []);
    bySource.get(offer.source).push(offer);
  }

  const sourceMedians = [...bySource.entries()].map(([source, rows]) => ({
    source,
    median: weightedMedian(rows),
    count: rows.length,
  }));

  return {
    median: median(sourceMedians.map((x) => x.median)),
    sourceMedians,
  };
}

const GROUP_LABELS = {
  particular: "Mercado particular",
  portal: "Portales de autos",
  agencia: "Agencias / seminuevos",
};

function groupBreakdown(offers) {
  const groups = ["particular", "portal", "agencia"];

  return groups.map((key) => {
    const rows = offers.filter((x) => x.sourceGroup === key);
    const sources = [...new Set(rows.map((x) => x.source))];

    return {
      key,
      label: GROUP_LABELS[key],
      count: rows.length,
      median: weightedMedian(rows),
      lowest: rows.length ? Math.min(...rows.map((x) => x.price)) : null,
      sources,
    };
  });
}

export function analyzeCarMarket(offers, spec) {
  const raw = offers.filter(
    (x) =>
      Number.isFinite(Number(x.price)) &&
      Number(x.price) >= 500000 &&
      (x.quality ?? 0) >= 60 &&
      weightOf(x) > 0
  );

  const exactYear = spec.year
    ? raw.filter((x) => !x.year || x.year === spec.year)
    : raw;

  const clean = removePriceOutliers(exactYear);

  const sourceCount = new Set(clean.map((x) => x.source)).size;
  const groupCount = new Set(
    clean.map((x) => x.sourceGroup).filter(Boolean)
  ).size;

  const balanced = sourceBalancedMedian(clean);
  const prices = sortedNumbers(clean.map((x) => x.price));
  const breakdown = groupBreakdown(clean);

  const particular = breakdown.find((x) => x.key === "particular");
  const recommendationReady = Boolean(spec.year && clean.length >= 3);
  const typical = recommendationReady ? balanced.median : null;

  const buyTarget =
    recommendationReady && particular?.count >= 2
      ? percentile(
          sortedNumbers(
            clean
              .filter((x) => x.sourceGroup === "particular")
              .map((x) => x.price)
          ),
          0.35
        )
      : recommendationReady
      ? percentile(prices, 0.3)
      : null;

  const sellRecommended = recommendationReady ? typical : null;
  const lowest = prices.length ? prices[0] : null;

  let confidenceScore = 0;
  confidenceScore += Math.min(35, clean.length * 3);
  confidenceScore += Math.min(35, sourceCount * 8);
  confidenceScore += Math.min(20, groupCount * 7);
  if (spec.year) confidenceScore += 10;

  const confidence =
    confidenceScore >= 75
      ? "Alta"
      : confidenceScore >= 50
      ? "Media"
      : clean.length
      ? "Baja"
      : "Sin datos";

  let score = null;

  if (recommendationReady && typical && lowest) {
    const discount = Math.max(0, (typical - lowest) / typical);
    score = Math.max(45, Math.min(98, Math.round(72 + discount * 100)));
  }

  return {
    rawCount: offers.length,
    validCount: clean.length,
    excludedCount: Math.max(0, offers.length - clean.length),
    sourceCount,
    groupCount,
    recommendationReady,
    needsYear: !spec.year,
    lowest,
    median: typical,
    average: weightedAverage(clean),
    buyTarget,
    sellRecommended,
    score,
    confidence,
    breakdown,
    sourceMedians: balanced.sourceMedians,
    particularMedian:
      breakdown.find((x) => x.key === "particular")?.median || null,
    portalMedian:
      breakdown.find((x) => x.key === "portal")?.median || null,
    agencyMedian:
      breakdown.find((x) => x.key === "agencia")?.median || null,
  };
}

export function summarizePrices(offers) {
  const valid = offers.filter(
    (offer) =>
      Number.isFinite(Number(offer.price)) &&
      Number(offer.price) > 0 &&
      weightOf(offer) > 0
  );
  const prices = sortedNumbers(valid.map((o) => o.price));

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

  const med = weightedMedian(valid);
  const average = weightedAverage(valid);
  const q1 = percentile(prices, 0.25);
  const q3 = percentile(prices, 0.75);
  const lowest = prices[0];
  const buyTarget = prices.length >= 3 ? q1 : Math.round(med * 0.97);
  const sellRecommended = prices.length >= 3 ? med : average;

  const discount = med ? Math.max(0, (med - lowest) / med) : 0;
  const spread = med ? Math.max(0, (q3 - q1) / med) : 0;

  let score = Math.round(72 + discount * 110 - spread * 20);
  score = Math.max(45, Math.min(98, score));

  const confidence =
    prices.length >= 6 ? "Alta" : prices.length >= 3 ? "Media" : "Baja";

  return {
    count: prices.length,
    lowest,
    median: med,
    average,
    buyTarget,
    sellRecommended,
    q1,
    q3,
    score,
    confidence,
  };
}
