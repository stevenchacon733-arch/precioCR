import { NextResponse } from "next/server";
import { searchSources } from "@/lib/sources";
import { analyzeCarMarket, summarizePrices } from "@/lib/pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim();
  const type = searchParams.get("type") === "car" ? "car" : "tech";

  if (q.length < 2) {
    return NextResponse.json(
      { error: "Escribe al menos 2 caracteres." },
      { status: 400 }
    );
  }

  const result = await searchSources(q, type);

  if (type === "car") {
    const stats = analyzeCarMarket(result.offers, result.spec);

    return NextResponse.json({
      query: q,
      type,
      fetchedAt: new Date().toISOString(),
      spec: result.spec,
      offers: result.offers,
      sources: result.sources,
      externalSources: result.externalSources,
      stats,
      note:
        "Para autos, PrecioCR balancea las fuentes para que un portal con muchos anuncios no domine el promedio. Marketplace se abre como fuente externa y no entra al cálculo automático.",
    });
  }

  const stats = summarizePrices(result.offers);

  return NextResponse.json({
    query: q,
    type,
    fetchedAt: new Date().toISOString(),
    offers: result.offers,
    sources: result.sources,
    externalSources: result.externalSources,
    stats,
    note:
      "PrecioCR calcula referencias solo con precios que logra verificar automáticamente.",
  });
}
