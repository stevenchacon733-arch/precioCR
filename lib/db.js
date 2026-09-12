const DEFAULT_LIMIT = 300;

function config() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase no está configurado.");
  }

  return { url, key };
}

async function supabaseFetch(path, options = {}) {
  const { url, key } = config();

  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: {
      // Supabase's new sb_secret_* keys must be sent as an API key,
      // not as Authorization: Bearer (they are opaque keys, not JWTs).
      apikey: key,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    cache: "no-store",
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `Supabase ${response.status}: ${text.slice(0, 300) || response.statusText}`
    );
  }

  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function isDatabaseConfigured() {
  return Boolean(
    process.env.SUPABASE_URL &&
      (process.env.SUPABASE_SECRET_KEY ||
        process.env.SUPABASE_SERVICE_ROLE_KEY)
  );
}

export async function listActiveListings(category, limit = DEFAULT_LIMIT) {
  const today = new Date().toISOString().slice(0, 10);
  const params = new URLSearchParams();

  params.set("select", "*");
  params.set("category", `eq.${category}`);
  params.set("status", "eq.active");
  params.set("or", `(expires_at.is.null,expires_at.gte.${today})`);
  params.set("order", "observed_at.desc,created_at.desc");
  params.set("limit", String(Math.min(1000, Math.max(1, limit))));

  return (
    (await supabaseFetch(`listings?${params.toString()}`, {
      method: "GET",
    })) || []
  );
}

export async function listRecentListings(limit = 100) {
  const params = new URLSearchParams();
  params.set("select", "*");
  params.set("order", "created_at.desc");
  params.set("limit", String(Math.min(500, Math.max(1, limit))));

  return (
    (await supabaseFetch(`listings?${params.toString()}`, {
      method: "GET",
    })) || []
  );
}

export async function insertListings(rows) {
  if (!Array.isArray(rows) || !rows.length) return [];

  return (
    (await supabaseFetch("listings", {
      method: "POST",
      headers: {
        Prefer: "return=representation",
      },
      body: JSON.stringify(rows),
    })) || []
  );
}

export async function deleteListing(id) {
  if (!id) throw new Error("Falta id.");

  await supabaseFetch(`listings?id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: {
      Prefer: "return=minimal",
    },
  });

  return true;
}

export async function updateListing(id, patch) {
  if (!id) throw new Error("Falta id.");

  return (
    (await supabaseFetch(`listings?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: {
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        ...patch,
        updated_at: new Date().toISOString(),
      }),
    })) || []
  );
}
