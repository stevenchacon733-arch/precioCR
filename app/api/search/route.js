import { NextResponse } from "next/server";
import { searchSources } from "@/lib/sources";
import {
  searchDatabaseListings,
  mergeSourceStatuses,
  dedupeCombinedOffers,
} from "@/lib/database-listings";
import { analyzeCarMarket, summarizePrices } from "@/lib/pricing";
import { parseCarQuery } from "@/lib/car";
import { validateCatalogQuery } from "@/lib/catalog-safety";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim();
  const requestedType = searchParams.get("type") || "tech";
  const allowedTypes = new Set(["car", "tech", "supplement"]);
  const type = allowedTypes.has(requestedType) ? requestedType : "tech";

  if (q.length < 2) {
    return NextResponse.json(
      { error: "Escribe al menos 2 caracteres." },
      { status: 400 }
    );
  }

  const catalogCheck = validateCatalogQuery(q, type);
  if (!catalogCheck.ok) {
    return NextResponse.json(
      { error: catalogCheck.message },
      { status: 400 }
    );
  }

  const [automatic, database] = await Promise.all([
    searchSources(q, type),
    searchDatabaseListings(q, type),
  ]);

  const offers = dedupeCombinedOffers([
    ...(automatic.offers || []),
    ...(database.offers || []),
  ]);

  const sources = mergeSourceStatuses(
    automatic.sources || [],
    database.sources || []
  );

  if (type === "car") {
    const spec = automatic.spec || parseCarQuery(q);
    const stats = analyzeCarMarket(offers, spec);

    return NextResponse.json({
      query: q,
      type,
      fetchedAt: new Date().toISOString(),
      spec,
      offers,
      sources,
      externalSources: automatic.externalSources || [],
      fx: automatic.fx || null,
      database: {
        configured: database.configured,
        count: database.offers?.length || 0,
        error: database.error || null,
      },
      stats,
      note:
        "PrecioCR combina fuentes automáticas con Base PrecioCR. Los datos manuales antiguos pierden peso y los expirados no participan.",
    });
  }

  const stats = summarizePrices(offers);

  return NextResponse.json({
    query: q,
    type,
    fetchedAt: new Date().toISOString(),
    offers,
    sources,
    externalSources: automatic.externalSources || [],
    database: {
      configured: database.configured,
      count: database.offers?.length || 0,
      error: database.error || null,
    },
    stats,
    note:
      "PrecioCR combina fuentes automáticas con Base PrecioCR y pondera los datos por antigüedad.",
  });
}
