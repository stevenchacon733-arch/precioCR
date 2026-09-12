import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import {
  deleteListing,
  insertListings,
  listRecentListings,
  updateListing,
} from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_CATEGORIES = new Set(["car", "tech"]);
const ALLOWED_SEGMENTS = new Set(["particular", "portal", "agencia", "retail"]);
const ALLOWED_STATUS = new Set(["active", "sold", "removed", "expired"]);

function isoDate(value) {
  if (!value) return null;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : value;
}

function addDays(dateString, days) {
  const date = dateString
    ? new Date(`${dateString}T12:00:00Z`)
    : new Date();

  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function asNumber(value) {
  if (value === "" || value == null) return null;
  const cleaned = String(value).replace(/[^\d.-]/g, "");
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
}

function asBoolean(value) {
  if (typeof value === "boolean") return value;
  const normalized = String(value ?? "").trim().toLowerCase();
  return ["true", "1", "yes", "si", "sí", "x"].includes(normalized);
}

function cleanRow(input = {}) {
  const category = String(input.category || "").trim().toLowerCase();
  const marketSegment = String(
    input.market_segment || input.marketSegment || ""
  )
    .trim()
    .toLowerCase();

  const observed =
    isoDate(input.observed_at || input.observedAt) ||
    new Date().toISOString().slice(0, 10);

  const source = String(input.source || "").trim();
  const expiryDefault =
    source.toLowerCase().includes("marketplace") ? 60 : 90;

  const row = {
    source,
    category,
    market_segment:
      category === "car"
        ? ALLOWED_SEGMENTS.has(marketSegment)
          ? marketSegment
          : "particular"
        : "retail",
    brand: String(input.brand || "").trim() || null,
    model: String(input.model || "").trim() || null,
    year: asNumber(input.year),
    title: String(input.title || "").trim() || null,
    price_crc: asNumber(input.price_crc ?? input.priceCrc ?? input.price),
    price_original: asNumber(input.price_original ?? input.priceOriginal),
    currency: String(input.currency || "CRC").trim().toUpperCase(),
    kilometers: asNumber(input.kilometers ?? input.km),
    transmission: String(input.transmission || "").trim() || null,
    fuel: String(input.fuel || "").trim() || null,
    condition: String(input.condition || "").trim() || null,
    province: String(input.province || "").trim() || null,
    url: String(input.url || "").trim() || null,
    verified: input.verified == null ? true : asBoolean(input.verified),
    status: ALLOWED_STATUS.has(String(input.status || "").toLowerCase())
      ? String(input.status).toLowerCase()
      : "active",
    observed_at: observed,
    expires_at:
      isoDate(input.expires_at || input.expiresAt) ||
      addDays(observed, expiryDefault),
    notes: String(input.notes || "").trim() || null,
    updated_at: new Date().toISOString(),
  };

  if (!row.title) {
    row.title = [row.brand, row.model, row.year]
      .filter(Boolean)
      .join(" ");
  }

  if (!row.source) throw new Error("Falta source.");
  if (!ALLOWED_CATEGORIES.has(row.category)) {
    throw new Error("category debe ser car o tech.");
  }
  if (!row.price_crc || row.price_crc <= 0) {
    throw new Error("price_crc debe ser mayor que 0.");
  }

  return row;
}

function unauthorized() {
  return NextResponse.json({ error: "No autorizado." }, { status: 401 });
}

export async function GET(request) {
  if (!isAdminRequest(request)) return unauthorized();

  try {
    const rows = await listRecentListings(150);
    return NextResponse.json({ listings: rows });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "No se pudo leer la base." },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  if (!isAdminRequest(request)) return unauthorized();

  try {
    const body = await request.json();
    const incoming = Array.isArray(body.listings)
      ? body.listings
      : body.listing
      ? [body.listing]
      : [];

    if (!incoming.length) {
      return NextResponse.json(
        { error: "No recibí anuncios." },
        { status: 400 }
      );
    }

    if (incoming.length > 500) {
      return NextResponse.json(
        { error: "Máximo 500 anuncios por importación." },
        { status: 400 }
      );
    }

    const rows = incoming.map(cleanRow);
    const inserted = await insertListings(rows);

    return NextResponse.json({
      ok: true,
      inserted: inserted.length,
      listings: inserted,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "No se pudo guardar." },
      { status: 400 }
    );
  }
}

export async function PATCH(request) {
  if (!isAdminRequest(request)) return unauthorized();

  try {
    const body = await request.json();
    const id = String(body.id || "");
    const patch = {};

    if (body.status && ALLOWED_STATUS.has(body.status)) {
      patch.status = body.status;
    }
    if (body.verified != null) patch.verified = asBoolean(body.verified);
    if (body.expires_at) patch.expires_at = isoDate(body.expires_at);

    const updated = await updateListing(id, patch);

    return NextResponse.json({
      ok: true,
      listing: updated?.[0] || null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "No se pudo actualizar." },
      { status: 400 }
    );
  }
}

export async function DELETE(request) {
  if (!isAdminRequest(request)) return unauthorized();

  try {
    const body = await request.json();
    await deleteListing(String(body.id || ""));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "No se pudo eliminar." },
      { status: 400 }
    );
  }
}
