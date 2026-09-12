"use client";

import { useEffect, useMemo, useState } from "react";

const emptyListing = {
  source: "Facebook Marketplace",
  category: "car",
  market_segment: "particular",
  brand: "",
  model: "",
  year: "",
  title: "",
  price_crc: "",
  price_original: "",
  currency: "CRC",
  kilometers: "",
  transmission: "",
  fuel: "",
  condition: "Usado",
  province: "",
  url: "",
  verified: true,
  status: "active",
  observed_at: new Date().toISOString().slice(0, 10),
  expires_at: "",
  notes: "",
};

function money(value) {
  if (!value) return "—";
  return new Intl.NumberFormat("es-CR", {
    style: "currency",
    currency: "CRC",
    maximumFractionDigits: 0,
  }).format(value);
}

function parseCsv(text) {
  const firstLine = text.split(/\r?\n/)[0] || "";
  const delimiter =
    (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length
      ? ";"
      : ",";

  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && quoted && next === '"') {
      value += '"';
      i++;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === delimiter && !quoted) {
      row.push(value.trim());
      value = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i++;
      row.push(value.trim());
      value = "";

      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
      continue;
    }

    value += char;
  }

  row.push(value.trim());
  if (row.some((cell) => cell !== "")) rows.push(row);

  if (rows.length < 2) return [];

  const headers = rows[0].map((x) =>
    x
      .replace(/^\uFEFF/, "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_")
  );

  return rows.slice(1).map((cells) =>
    Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]))
  );
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",;\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function downloadCsv(listings) {
  const headers = [
    "source",
    "category",
    "market_segment",
    "brand",
    "model",
    "year",
    "title",
    "price_crc",
    "price_original",
    "currency",
    "kilometers",
    "transmission",
    "fuel",
    "condition",
    "province",
    "url",
    "verified",
    "status",
    "observed_at",
    "expires_at",
    "notes",
  ];

  const lines = [
    headers.join(","),
    ...listings.map((row) =>
      headers.map((header) => csvEscape(row[header])).join(",")
    ),
  ];

  const blob = new Blob(["\uFEFF" + lines.join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `preciocr-base-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AdminPanel() {
  const [logged, setLogged] = useState(false);
  const [password, setPassword] = useState("");
  const [listing, setListing] = useState(emptyListing);
  const [listings, setListings] = useState([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [importRows, setImportRows] = useState([]);

  async function loadListings() {
    const res = await fetch("/api/admin/listings", { cache: "no-store" });

    if (res.status === 401) {
      setLogged(false);
      return;
    }

    const data = await res.json();

    if (!res.ok) {
      setMessage(data.error || "No se pudo leer la base.");
      return;
    }

    setLogged(true);
    setListings(data.listings || []);
  }

  useEffect(() => {
    loadListings();
  }, []);

  async function login(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    const data = await res.json();

    if (!res.ok) {
      setMessage(data.error || "No se pudo entrar.");
      setBusy(false);
      return;
    }

    setLogged(true);
    setPassword("");
    await loadListings();
    setBusy(false);
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    setLogged(false);
    setListings([]);
  }

  function change(key, value) {
    setListing((current) => ({ ...current, [key]: value }));
  }

  async function saveListing(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    const res = await fetch("/api/admin/listings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listing }),
    });

    const data = await res.json();

    if (!res.ok) {
      setMessage(data.error || "No se pudo guardar.");
      setBusy(false);
      return;
    }

    setMessage(`Guardado: ${data.inserted} anuncio.`);
    setListing({
      ...emptyListing,
      observed_at: new Date().toISOString().slice(0, 10),
    });
    await loadListings();
    setBusy(false);
  }

  async function importCsv() {
    if (!importRows.length) return;

    setBusy(true);
    setMessage("");

    const res = await fetch("/api/admin/listings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listings: importRows }),
    });

    const data = await res.json();

    if (!res.ok) {
      setMessage(data.error || "No se pudo importar.");
      setBusy(false);
      return;
    }

    setMessage(`Importados ${data.inserted} anuncios.`);
    setImportRows([]);
    await loadListings();
    setBusy(false);
  }

  async function remove(id) {
    if (!confirm("¿Eliminar este anuncio de Base PrecioCR?")) return;

    const res = await fetch("/api/admin/listings", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });

    if (res.ok) await loadListings();
  }

  async function setStatus(id, status) {
    const res = await fetch("/api/admin/listings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });

    if (res.ok) await loadListings();
  }

  function fileChanged(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const rows = parseCsv(String(reader.result || ""));
        setImportRows(rows);
        setMessage(
          rows.length
            ? `${rows.length} filas listas para importar.`
            : "El CSV no tiene filas reconocibles."
        );
      } catch {
        setMessage("No pude leer el CSV.");
      }
    };
    reader.readAsText(file);
  }

  if (!logged) {
    return (
      <main className="adminPage">
        <div className="adminLogin">
          <a className="brand" href="/">
            <span className="brandMark">₡</span>
            <span>Precio<span>CR</span></span>
          </a>
          <span className="eyebrow">ADMINISTRACIÓN</span>
          <h1>Base PrecioCR</h1>
          <p>
            Agrega Marketplace, agencias o cualquier fuente que no pueda
            consultarse automáticamente.
          </p>

          <form onSubmit={login}>
            <input
              type="password"
              placeholder="Contraseña de administrador"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <button disabled={busy}>
              {busy ? "Entrando…" : "Entrar"}
            </button>
          </form>

          {message && <div className="adminMessage">{message}</div>}
        </div>
      </main>
    );
  }

  return (
    <main className="adminPage">
      <div className="adminShell">
        <div className="adminTopbar">
          <a className="brand" href="/">
            <span className="brandMark">₡</span>
            <span>Precio<span>CR</span></span>
          </a>
          <div>
            <button className="adminSecondary" onClick={() => downloadCsv(listings)}>
              Descargar base CSV
            </button>
            <button className="adminSecondary" onClick={logout}>
              Salir
            </button>
          </div>
        </div>

        <section className="adminHero">
          <span className="eyebrow">BASE PRECIOCR</span>
          <h1>Datos manuales + importación CSV.</h1>
          <p>
            Los anuncios manuales se mezclan con las fuentes automáticas.
            Marketplace expira por defecto a los 60 días y los datos viejos
            pesan menos en el cálculo.
          </p>
        </section>

        {message && <div className="adminMessage">{message}</div>}

        <div className="adminGrid">
          <form className="adminCard adminForm" onSubmit={saveListing}>
            <div className="adminCardHead">
              <div>
                <span className="eyebrow">NUEVO ANUNCIO</span>
                <h2>Agregar manualmente</h2>
              </div>
            </div>

            <div className="adminFields">
              <label>
                Fuente
                <input
                  value={listing.source}
                  onChange={(e) => change("source", e.target.value)}
                  placeholder="Facebook Marketplace"
                  required
                />
              </label>

              <label>
                Categoría
                <select
                  value={listing.category}
                  onChange={(e) => change("category", e.target.value)}
                >
                  <option value="car">Carro</option>
                  <option value="tech">Tecnología</option>
                  <option value="supplement">Suplemento</option>
                  <option value="medication">Medicamento</option>
                </select>
              </label>

              {listing.category === "car" && (
                <label>
                  Tipo de mercado
                  <select
                    value={listing.market_segment}
                    onChange={(e) => change("market_segment", e.target.value)}
                  >
                    <option value="particular">Particular</option>
                    <option value="portal">Portal</option>
                    <option value="agencia">Agencia</option>
                  </select>
                </label>
              )}

              <label>
                Marca
                <input
                  value={listing.brand}
                  onChange={(e) => change("brand", e.target.value)}
                  placeholder="Toyota"
                />
              </label>

              <label>
                Modelo
                <input
                  value={listing.model}
                  onChange={(e) => change("model", e.target.value)}
                  placeholder="RAV4"
                />
              </label>

              <label>
                Año
                <input
                  type="number"
                  value={listing.year}
                  onChange={(e) => change("year", e.target.value)}
                  placeholder="2024"
                />
              </label>

              <label>
                Precio CRC
                <input
                  type="number"
                  value={listing.price_crc}
                  onChange={(e) => change("price_crc", e.target.value)}
                  placeholder="17900000"
                  required
                />
              </label>

              <label>
                Kilometraje
                <input
                  type="number"
                  value={listing.kilometers}
                  onChange={(e) => change("kilometers", e.target.value)}
                  placeholder="28000"
                />
              </label>

              <label>
                Transmisión
                <input
                  value={listing.transmission}
                  onChange={(e) => change("transmission", e.target.value)}
                  placeholder="Automática"
                />
              </label>

              <label>
                Combustible
                <input
                  value={listing.fuel}
                  onChange={(e) => change("fuel", e.target.value)}
                  placeholder="Gasolina"
                />
              </label>

              <label>
                Provincia
                <input
                  value={listing.province}
                  onChange={(e) => change("province", e.target.value)}
                  placeholder="San José"
                />
              </label>

              <label className="adminWide">
                URL
                <input
                  value={listing.url}
                  onChange={(e) => change("url", e.target.value)}
                  placeholder="https://..."
                />
              </label>

              <label>
                Observado
                <input
                  type="date"
                  value={listing.observed_at}
                  onChange={(e) => change("observed_at", e.target.value)}
                />
              </label>

              <label>
                Expira
                <input
                  type="date"
                  value={listing.expires_at}
                  onChange={(e) => change("expires_at", e.target.value)}
                />
              </label>

              <label className="adminWide">
                Notas
                <textarea
                  value={listing.notes}
                  onChange={(e) => change("notes", e.target.value)}
                  placeholder="Versión, extras, estado, batería, etc."
                />
              </label>
            </div>

            <button className="adminPrimary" disabled={busy}>
              {busy ? "Guardando…" : "Guardar anuncio"}
            </button>
          </form>

          <section className="adminCard">
            <div className="adminCardHead">
              <div>
                <span className="eyebrow">IMPORTACIÓN MASIVA</span>
                <h2>Subir CSV</h2>
              </div>
            </div>

            <p className="adminMuted">
              Descarga la plantilla, llénala en Excel o Google Sheets y
              expórtala como CSV.
            </p>

            <div className="adminImportActions">
              <a className="adminSecondary" href="/preciocr_import_template.csv">
                Descargar plantilla CSV
              </a>

              <label className="adminUpload">
                Elegir CSV
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={fileChanged}
                />
              </label>
            </div>

            {importRows.length > 0 && (
              <div className="importPreview">
                <strong>{importRows.length} filas listas</strong>
                <span>
                  {importRows
                    .slice(0, 4)
                    .map(
                      (row) =>
                        `${row.source || "Fuente"} · ${row.brand || ""} ${
                          row.model || ""
                        } ${row.year || ""}`
                    )
                    .join(" | ")}
                </span>

                <button
                  className="adminPrimary"
                  onClick={importCsv}
                  disabled={busy}
                >
                  Importar {importRows.length}
                </button>
              </div>
            )}

            <div className="adminRules">
              <h3>Antigüedad</h3>
              <div><b>0–14 días</b><span>100% del peso</span></div>
              <div><b>15–30 días</b><span>80% del peso</span></div>
              <div><b>31–60 días</b><span>50% del peso</span></div>
              <div><b>Expirado</b><span>No participa</span></div>
            </div>
          </section>
        </div>

        <section className="adminCard adminTableCard">
          <div className="adminCardHead">
            <div>
              <span className="eyebrow">DATOS GUARDADOS</span>
              <h2>{listings.length} anuncios recientes</h2>
            </div>
          </div>

          <div className="adminTableWrap">
            <table className="adminTable">
              <thead>
                <tr>
                  <th>Fuente</th>
                  <th>Anuncio</th>
                  <th>Precio</th>
                  <th>Observado</th>
                  <th>Expira</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {listings.map((row) => (
                  <tr key={row.id}>
                    <td>{row.source}</td>
                    <td>
                      <strong>
                        {row.title ||
                          [row.brand, row.model, row.year]
                            .filter(Boolean)
                            .join(" ")}
                      </strong>
                      <small>
                        {[row.kilometers ? `${row.kilometers} km` : null, row.province]
                          .filter(Boolean)
                          .join(" · ")}
                      </small>
                    </td>
                    <td>{money(row.price_crc)}</td>
                    <td>{row.observed_at || "—"}</td>
                    <td>{row.expires_at || "—"}</td>
                    <td>
                      <select
                        value={row.status}
                        onChange={(e) => setStatus(row.id, e.target.value)}
                      >
                        <option value="active">Activo</option>
                        <option value="sold">Vendido</option>
                        <option value="removed">Eliminado</option>
                        <option value="expired">Expirado</option>
                      </select>
                    </td>
                    <td>
                      <button
                        className="adminDanger"
                        onClick={() => remove(row.id)}
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
