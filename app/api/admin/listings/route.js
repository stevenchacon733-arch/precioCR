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
const ALLOWED_AVAILABILITY = new Set(["available", "unavailable", "unknown"]);

function cleanStoreLocations(value) {
  if (value == null || value === "") return [];
  let locations = value;
  if (typeof value === "string") {
    if (!value.trim()) return [];
    if (value.length > 50000) throw new Error("store_locations supera el tamaño permitido.");
    try {
      locations = JSON.parse(value);
    } catch {
      throw new Error("store_locations debe contener una lista JSON válida.");
    }
  }
  if (!Array.isArray(locations) || locations.length > 50) {
    throw new Error("store_locations debe ser una lista de hasta 50 locales.");
  }

  return locations.map((location, index) => {
    const prefix = `Local ${index + 1}`;
    if (!location || typeof location !== "object" || Array.isArray(location)) {
      throw new Error(`${prefix}: debe ser un objeto con nombre y ubicación.`);
    }
    function textField(field, maxLength, required = false) {
      const value = location[field];
      if (value != null && typeof value !== "string") {
        throw new Error(`${prefix}: ${field} debe ser texto.`);
      }
      const text = (value || "").trim();
      if ((required && !text) || text.length > maxLength) {
        throw new Error(`${prefix}: ${field} ${required ? "es obligatorio y " : ""}admite hasta ${maxLength} caracteres.`);
      }
      return text;
    }

    const name = textField("name", 160, true);
    const address = textField("address", 400);
    const province = textField("province", 80);
    const url = textField("url", 2048);
    const availability = textField("availability", 20) || "unknown";
    if (!ALLOWED_AVAILABILITY.has(availability)) {
      throw new Error(`${prefix}: availability debe ser available, unavailable o unknown.`);
    }
    if (url) {
      let parsed;
      try {
        parsed = new URL(url);
      } catch {
        throw new Error(`${prefix}: URL inválida.`);
      }
      if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password) {
        throw new Error(`${prefix}: usa una URL pública http o https sin credenciales.`);
      }
    }

    return {
      name,
      ...(address ? { address } : {}),
      ...(province ? { province } : {}),
      availability,
      ...(url ? { url } : {}),
    };
  });
}

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

  const storeLocations = cleanStoreLocations(input.store_locations);
  if (storeLocations.length) {
    if (row.category !== "tech") {
      throw new Error("store_locations solo aplica a productos de tecnología.");
    }
    row.store_locations = storeLocations;
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

    const rows = incoming.map((input, index) => {
      try {
        return cleanRow(input);
      } catch (error) {
        throw new Error(`Fila ${index + 1}: ${error.message}`);
      }
    });
    // PostgREST requires the same keys in every row of a batch. Omit the new
    // column altogether when unused so existing databases continue to work.
    if (rows.some((row) => row.store_locations)) {
      for (const row of rows) row.store_locations ??= [];
    }
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
