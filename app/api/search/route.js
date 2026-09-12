import { NextResponse } from "next/server";
import { searchSources } from "@/lib/sources";
import { summarizePrices } from "@/lib/pricing";

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

  const { offers, sources, externalSources } = await searchSources(q, type);
  const stats = summarizePrices(offers);

  return NextResponse.json({
    query: q,
    type,
    fetchedAt: new Date().toISOString(),
    offers,
    sources,
    externalSources,
    stats,
    note:
      "PrecioCR solo calcula recomendaciones cuando encuentra precios verificables. Las fuentes pueden cambiar su estructura o limitar consultas automáticas.",
  });
}
