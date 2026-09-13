"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { provinceFromLocationQuery } from "@/lib/location";

const money = (value) =>
  value == null
    ? "—"
    : new Intl.NumberFormat("es-CR", {
        style: "currency",
        currency: "CRC",
        maximumFractionDigits: 0,
      }).format(value);

const number = (value) =>
  value == null ? "—" : new Intl.NumberFormat("es-CR").format(value);

const formatTime = (iso) => {
  if (!iso) return "";
  return new Intl.DateTimeFormat("es-CR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
};

const GROUP_INFO = {
  particular: {
    label: "Mercado particular",
    description: "Encuentra24",
  },
  portal: {
    label: "Portales de autos",
    description: "CRAutos y AutoCosmos",
  },
  agencia: {
    label: "Agencias / seminuevos",
    description: "Purdy, Grupo Q, Kia/Quality Motors, Suzuki/Inchcape y Veinsa",
  },
};

function Score({ stats, type }) {
  if (!stats?.score) {
    return (
      <div className="scoreCard emptyScore">
        <div>
          <span className="eyebrow">PRECIOCR SCORE</span>
          <h3>
            {type === "car" && stats?.needsYear
              ? "Agrega el año para calcular el precio justo"
              : "Necesitamos más datos comparables"}
          </h3>
          <p>
            {type === "car" && stats?.needsYear
              ? "En carros, mezclar años distintos puede distorsionar mucho el valor."
              : "El score aparece cuando encontramos suficientes precios confiables."}
          </p>
        </div>
      </div>
    );
  }

  const label =
    stats.score >= 90
      ? "Excelente oportunidad"
      : stats.score >= 80
      ? "Buen precio"
      : stats.score >= 65
      ? "Precio razonable"
      : "Comparar con cuidado";

  return (
    <div className="scoreCard">
      <div>
        <span className="eyebrow">
          PRECIOCR SCORE · CONFIANZA {stats.confidence.toUpperCase()}
        </span>
        <h3>{label}</h3>
        <p>
          {type === "car"
            ? `Calculado con ${stats.validCount} anuncios válidos de ${stats.sourceCount} fuentes.`
            : `Calculado con ${stats.count} precios verificables.`}
        </p>
      </div>
      <div className="scoreCircle">
        <strong>{stats.score}</strong>
        <span>/100</span>
      </div>
    </div>
  );
}

function SourceStatus({ sources = [] }) {
  const active = sources.filter((s) => s.count > 0);
  const reachableNoMatch = sources.filter(
    (s) =>
      !s.count &&
      String(s.error || "").startsWith("Conector OK")
  );
  const unavailable = sources.filter(
    (s) =>
      !s.count &&
      !String(s.error || "").startsWith("Conector OK")
  );

  return (
    <div className="sourceStatusWrap">
      {active.length > 0 && (
        <div className="sourceStatus">
          {active.map((s) => (
            <a
              href={s.url}
              target="_blank"
              rel="noreferrer"
              key={s.source}
              className="sourcePill ok"
            >
              <span className="statusDot" />
              <b>{s.source}</b>
              <small>
                {s.count} resultado{s.count === 1 ? "" : "s"}
              </small>
            </a>
          ))}
        </div>
      )}

      {reachableNoMatch.length > 0 && (
        <div className="sourceQuietLine">
          <span>Consultadas sin coincidencias en la ubicación seleccionada:</span>
          <b>{reachableNoMatch.map((s) => s.source).join(" · ")}</b>
          <small>{reachableNoMatch.map((s) => s.error?.replace("Conector OK · ", "")).join(" · ")}</small>
        </div>
      )}

      {unavailable.length > 0 && (
        <div className="sourceWarningLine">
          <span>Temporalmente no disponibles:</span>
          <b>{unavailable.map((s) => s.source).join(" · ")}</b>
        </div>
      )}
    </div>
  );
}

function ExternalSources({ sources = [], province }) {
  if (!sources.length) return null;

  return (
    <div className="externalSearches">
      <span>Fuentes externas:</span>
      {sources.map((source) => (
        <a
          key={source.name}
          href={source.url}
          target="_blank"
          rel="noreferrer"
          className={source.name.includes("Facebook") ? "marketplaceButton marketplaceMain" : "marketplaceButton"}
        >
          <b>{source.name} ↗</b>
          <small>{source.note}</small>
        </a>
      ))}
      {province && (
        <p className="externalLocationNote">
          En las páginas externas, selecciona también {province} para buscar en la misma ubicación.
        </p>
      )}
    </div>
  );
}

function CarMarketBreakdown({ stats }) {
  if (!stats?.breakdown?.length) return null;

  return (
    <div className="marketBreakdown">
      {stats.breakdown.map((group) => (
        <div className="marketGroupCard" key={group.key}>
          <span className={`groupBadge ${group.key}`}>{group.label}</span>
          <strong>{group.median ? money(group.median) : "Sin datos"}</strong>
          <small>
            {group.count
              ? `${group.count} anuncios · ${group.sources.join(", ")}`
              : GROUP_INFO[group.key]?.description}
          </small>
        </div>
      ))}
    </div>
  );
}

function YearAlternatives({ offers = [], requestedYear }) {
  if (!offers.length) return null;

  return (
    <div className="yearAlternatives" role="status">
      <div>
        <span className="eyebrow">OTROS AÑOS DISPONIBLES</span>
        <h3>No mezclamos estos datos en el precio recomendado.</h3>
        <p>
          Sí encontramos anuncios parecidos, pero son de años distintos a {requestedYear}.
        </p>
      </div>
      <div className="yearAlternativeList">
        {offers.slice(0, 6).map((offer, index) => (
          <a key={`${offer.source}-${offer.url}-${index}`} href={offer.url} target="_blank" rel="noreferrer">
            <strong>{offer.title}</strong>
            <span>{offer.year} · {money(offer.price)} · {offer.source}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

function StoreLocations({ offer }) {
  const locations = (offer.storeLocations || []).filter((location) => location?.name);

  return (
    <div className="storeLocations">
      {locations.length > 0 && (
        <details>
          <summary>
            {offer.storeLocationsScope === "retailer" ? "Locales de la cadena" : "Ubicaciones del producto"}
            {" · "}{offer.source} ({locations.length})
          </summary>
          <ul className="storeLocationList">
            {locations.map((location, index) => (
              <li key={`${location.name}-${index}`}>
                <strong>
                  {location.url ? (
                    <a href={location.url} target="_blank" rel="noreferrer">
                      {location.name} ↗
                    </a>
                  ) : location.name}
                </strong>
                {(location.address || location.province) && (
                  <span>{[location.address, location.province].filter(Boolean).join(" · ")}</span>
                )}
                <a
                  className="storeMapLink"
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                    [location.name, location.address, location.province, "Costa Rica"]
                      .filter(Boolean)
                      .join(", ")
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Ver en Google Maps ↗
                </a>
                <small className={location.availability === "available" ? "branchAvailable" : ""}>
                  {location.availability === "available"
                    ? "Producto disponible en este local"
                    : location.availability === "unavailable"
                    ? "Producto no disponible en este local"
                    : "Consultar disponibilidad del producto"}
                </small>
              </li>
            ))}
          </ul>
        </details>
      )}
      {offer.storeLocationsUrl && (
        <a className="storeLocatorLink" href={offer.storeLocationsUrl} target="_blank" rel="noreferrer">
          Ver locales de {offer.source} ↗
        </a>
      )}
      <p>
        {offer.locationNote || (locations.length || offer.storeLocationsUrl
          ? "Consulta en la tienda la disponibilidad del producto en cada local."
          : "La fuente no indica ubicaciones de locales.")}
      </p>
    </div>
  );
}

function OfferCard({ offer, i, type }) {
  return (
    <article className="liveOffer">
      <div className="offerRank">{String(i + 1).padStart(2, "0")}</div>
      <div className="offerInfo">
        <div className="offerMetaTop">
          <span className="offerSource">{offer.source}</span>
          {type === "car" && offer.sourceGroup && (
            <span className={`tinyGroup ${offer.sourceGroup}`}>
              {GROUP_INFO[offer.sourceGroup]?.label}
            </span>
          )}
          {type === "car" && offer.quality != null && (
            <span className="qualityTag">{offer.quality}% match</span>
          )}
          {offer.dataOrigin === "database" && (
            <span className="databaseTag">
              {offer.verified ? "Base PrecioCR ✓" : "Base PrecioCR"}
            </span>
          )}
        </div>
        <a className="offerTitleLink" href={offer.url} target="_blank" rel="noreferrer">
          <strong>{offer.title}</strong>
        </a>
        <span>
          {type === "car"
            ? [
                offer.year,
                offer.km != null ? `${number(offer.km)} km` : null,
                offer.transmission,
                offer.fuel,
                offer.province || "Ubicación no indicada",
              ]
                .filter(Boolean)
                .join(" · ")
            : [offer.condition, offer.meta].filter(Boolean).join(" · ")}
          {offer.observedAt ? ` · observado ${offer.observedAt}` : ""}
        </span>
      </div>
      <div className="offerPrice livePrice">
        <strong>{money(offer.price)}</strong>
        {offer.originalCurrency === "USD" && offer.originalPrice ? (
          <small>
            ${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(offer.originalPrice)}
            {" "}original
          </small>
        ) : null}
        <a className="offerSourceLink" href={offer.url} target="_blank" rel="noreferrer">
          Ver fuente ↗
        </a>
      </div>
      {type === "tech" && <StoreLocations offer={offer} />}
    </article>
  );
}

function LocationModal({ type, initialLocation, onClose, onApply }) {
  const [draftLocation, setDraftLocation] = useState(initialLocation || "San José");
  const [radius, setRadius] = useState("65");
  const mapQuery = `${type === "tech" ? "tiendas de tecnología" : "concesionarios de autos"} en ${draftLocation || "San José"}, Costa Rica`;

  function useCurrentLocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => setDraftLocation(`${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`),
      () => setDraftLocation("San José")
    );
  }

  function apply() {
    onApply(draftLocation, radius);
  }

  return (
    <div className="locationModalBackdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="locationModal" role="dialog" aria-modal="true" aria-labelledby="location-modal-title">
        <div className="locationModalHead">
          <h2 id="location-modal-title">Cambiar ubicación</h2>
          <button type="button" className="locationModalClose" onClick={onClose} aria-label="Cerrar">×</button>
        </div>
        <div className="locationModalBody">
          <label className="locationModalLabel" htmlFor="location-query">Buscar por ciudad, localidad o código postal</label>
          <div className="locationQueryField">
            <span aria-hidden="true">●</span>
            <div>
              <small>Ubicación</small>
              <input
                id="location-query"
                value={draftLocation}
                onChange={(event) => setDraftLocation(event.target.value)}
                placeholder="San José"
                autoFocus
              />
            </div>
          </div>
          <label className="locationRadiusField" htmlFor="location-radius">
            <span><small>Radio</small>{radius} kilómetros</span>
            <select id="location-radius" value={radius} onChange={(event) => setRadius(event.target.value)}>
              <option value="10">10 km</option>
              <option value="25">25 km</option>
              <option value="65">65 km</option>
              <option value="100">100 km</option>
            </select>
          </label>
          <button type="button" className="locationCurrentButton" onClick={useCurrentLocation}>
            Usar mi ubicación actual
          </button>
          <div className="locationModalMap">
            <div className="locationRadiusCircle" aria-hidden="true" />
            <iframe
              title={`Mapa de ${draftLocation || "San José"}`}
              src={`https://www.google.com/maps?q=${encodeURIComponent(mapQuery)}&output=embed`}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
          <p className="locationModalInfo"><strong>Información sobre la ubicación</strong>El filtro utiliza la provincia asociada a la ciudad seleccionada. El radio se conserva para orientar la búsqueda en el mapa.</p>
        </div>
        <div className="locationModalActions">
          <button type="button" className="locationModalSecondary" onClick={onClose}>Cancelar</button>
          <button type="button" className="locationModalPrimary" onClick={apply}>Aplicar ubicación</button>
        </div>
      </section>
    </div>
  );
}

export default function PriceApp() {
  const [type, setType] = useState("car");
  const [query, setQuery] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [groupFilter, setGroupFilter] = useState("all");
  const [locationEnabled, setLocationEnabled] = useState(false);
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [locationLabel, setLocationLabel] = useState("");
  const [province, setProvince] = useState("");
  const searchRequest = useRef(null);
  const requestedQuery = useRef("");
  const requestVersion = useRef(0);

  useEffect(() => () => {
    requestVersion.current += 1;
    searchRequest.current?.abort();
  }, []);

  const examples = useMemo(
    () =>
      type === "car"
        ? ["Toyota RAV4 2024", "Hyundai Tucson 2024", "Kia Sportage 2023"]
        : ["iPhone 15 128GB", "PlayStation 5 Slim", "Samsung Galaxy S24"],
    [type]
  );

  async function search(customQuery, options = {}) {
    const q = (customQuery ?? query).trim();
    if (q.length < 2) return;

    searchRequest.current?.abort();
    const controller = new AbortController();
    searchRequest.current = controller;
    requestedQuery.current = q;
    const version = ++requestVersion.current;
    const selectedProvince = options.province ?? (locationEnabled ? province : "");
    const params = new URLSearchParams({ q, type });
    if (selectedProvince) params.set("province", selectedProvince);

    setQuery(q);
    setLoading(true);
    setError("");
    setResult(null);
    setSourceFilter("all");
    setGroupFilter("all");

    try {
      const res = await fetch(
        `/api/search?${params}`,
        { cache: "no-store", signal: controller.signal }
      );
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "No se pudo completar la búsqueda.");
      }

      if (version !== requestVersion.current) return;
      setResult(data);
      setTimeout(
        () => version === requestVersion.current &&
          document
            .getElementById("resultado")
            ?.scrollIntoView({ behavior: "smooth" }),
        60
      );
    } catch (e) {
      if (version === requestVersion.current && e.name !== "AbortError") {
        setError(e.message || "No se pudo completar la búsqueda.");
      }
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }

  function changeType(next) {
    searchRequest.current?.abort();
    requestVersion.current += 1;
    requestedQuery.current = "";
    setLoading(false);
    setType(next);
    setQuery("");
    setResult(null);
    setError("");
    setSourceFilter("all");
    setGroupFilter("all");
  }

  function changeLocation(enabled, nextProvince) {
    const previousProvince = locationEnabled ? province : "";
    const selectedProvince = enabled ? nextProvince : "";
    setLocationEnabled(enabled);
    setProvince(nextProvince);
    setLocationLabel(nextProvince);
    if (previousProvince !== selectedProvince && (result || loading)) {
      search(result?.query || requestedQuery.current || query, { province: selectedProvince });
    }
  }

  function applyLocation(location, radius) {
    const selectedProvince = provinceFromLocationQuery(location);
    if (!selectedProvince) {
      setError("Selecciona una ciudad principal de Costa Rica o una provincia válida.");
      return;
    }
    setLocationModalOpen(false);
    changeLocation(true, selectedProvince);
    setLocationLabel(`${location} · ${radius} km`);
  }

  const availableSourceNames = Array.from(
    new Set(result?.offers?.map((offer) => offer.source) || [])
  );

  const visibleOffers =
    result?.offers?.filter((offer) => {
      const sourceOk =
        sourceFilter === "all" || offer.source === sourceFilter;
      const groupOk =
        groupFilter === "all" || offer.sourceGroup === groupFilter;
      return sourceOk && groupOk;
    }) || [];

  const locationFilter = result?.locationFilter || null;

  return (
    <>
      <header className="navWrap">
        <nav className="nav shell">
          <a className="brand" href="#top">
            <span className="brandMark">₡</span>
            <span>Precio<span>CR</span></span>
          </a>
          <div className="navLinks">
            <a href="#resultado">Explorar</a>
            <button onClick={() => changeType("car")}>Autos</button>
            <button onClick={() => changeType("tech")}>Tecnología</button>
            <a href="#como-funciona">Cómo funciona</a>
          </div>
          <a className="navButton" href="#buscador">Comparar ahora</a>
        </nav>
      </header>

      <main id="top">
        <section className="hero">
          <div className="shell heroInner">
            <div className="badge">
              🇨🇷 Comparador de precios para Costa Rica
            </div>

            <h1>
              Encuentra el precio<br />
              <span>justo de verdad.</span>
            </h1>

            <p className="heroText">
              Compara precios de carros y tecnología en Costa Rica con
              fuentes visibles, Base PrecioCR y referencias claras.
            </p>

            <div className="categorySwitch">
              <button
                className={type === "car" ? "active" : ""}
                onClick={() => changeType("car")}
              >
                🚗 Autos
              </button>
              <button
                className={type === "tech" ? "active" : ""}
                onClick={() => changeType("tech")}
              >
                📱 Tecnología
              </button>
            </div>

            <div className="searchBox" id="buscador">
              <span className="searchIcon">⌕</span>
              <input
                aria-label={type === "car" ? "Buscar vehículo" : "Buscar producto de tecnología"}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && search()}
                placeholder={
                  type === "car"
                    ? "Ej. Toyota RAV4 2024"
                    : "Ej. iPhone 15 128GB"
                }
              />
              <button onClick={() => search()} disabled={loading}>
                {loading ? "Comparando..." : "Buscar precio"}
              </button>
            </div>

            {(type === "car" || type === "tech") && (
              <div className="locationSearchFilter">
                <label className="locationToggle" htmlFor="filter-location">
                  <input
                    id="filter-location"
                    type="checkbox"
                    checked={locationEnabled}
                    onChange={(e) => changeLocation(e.target.checked, e.target.checked ? province : "")}
                    aria-controls={locationEnabled ? "location-province-field" : undefined}
                    aria-describedby="location-filter-help"
                  />
                  <span>Filtrar {type === "tech" ? "tiendas" : "ubicación"} <small>(opcional)</small></span>
                </label>
                {locationEnabled && (
                  <>
                    <button type="button" className="locationChangeButton" onClick={() => setLocationModalOpen(true)}>
                      <span aria-hidden="true">●</span>
                      <span><small>Ubicación</small>{locationLabel || province || "Todo Costa Rica"}</span>
                      <b>›</b>
                    </button>
                  </>
                )}
                <p id="location-filter-help">
                  {locationEnabled && province
                    ? `Solo mostramos ${type === "tech" ? "productos con tiendas identificadas" : "anuncios con ubicación identificada"} en esta provincia.`
                    : `Sin filtro, buscamos en todo Costa Rica, incluso ${type === "tech" ? "productos sin tienda identificada" : "anuncios sin ubicación indicada"}.`}
                </p>
              </div>
            )}

            <div className="exampleRow">
              <span>Prueba:</span>
              {examples.map((x) => (
                <button key={x} onClick={() => search(x)}>
                  {x}
                </button>
              ))}
            </div>

            {type === "car" && (
              <p className="yearTip">
                Consejo: agrega el <b>año</b> para obtener un precio recomendado mucho más preciso.
              </p>
            )}


            {error && <div className="errorBox" role="alert">{error}</div>}

            <div className="trustRow">
              <span>✓ Fuentes visibles</span>
              <span>✓ Base PrecioCR + fuentes automáticas</span>
              <span>✓ Comparación solo entre productos compatibles</span>
            </div>
          </div>
        </section>

        <section className="section shell" id="resultado">
          {!result && !loading && (
            <div className="preSearch">
              <span className="eyebrow">PRECIOCR V8</span>
              <h2>
                {type === "car"
                  ? "Mercado automotor con varias fuentes."
                  : "Compara tecnología en varias tiendas."}
              </h2>
              <p>
                {type === "car"
                  ? "Consultamos portales, agencias y Base PrecioCR."
                  : "PrecioCR consulta las fuentes tecnológicas disponibles y conserva el enlace original."}
              </p>
            </div>
          )}

          {loading && (
            <div className="loadingState" role="status">
              <div className="loader" />
              <h2>Comparando precios…</h2>
              <p>
                Estamos consultando las fuentes disponibles. Puede tardar unos segundos.
              </p>
            </div>
          )}

          {result && (
            <>
              <div className="sectionHead">
                <div>
                  <span className="eyebrow">
                    {result.type === "car"
                      ? "ANÁLISIS DE MERCADO AUTOMOTOR"
                      : "TECNOLOGÍA BUSCADA"}
                  </span>
                  <h2>{result.query}</h2>
                  <p>
                    {result.type === "car"
                      ? `${result.stats.validCount} anuncios válidos · ${result.stats.sourceCount} fuentes · ${result.stats.excludedCount} descartados por calidad`
                      : `${result.stats.count} precios verificables`}
                    {" · "}
                    Consulta: {formatTime(result.fetchedAt)}
                  </p>
                </div>
                <div className="updated">
                  <span className="liveDot" />
                  Consulta en vivo
                </div>
              </div>

              {locationFilter?.province && (
                <div className="locationResultNotice" role="status">
                  <div>
                    <b>Ubicación: {locationFilter.province}</b>
                    <p>
                      {locationFilter.matchedCount} de {locationFilter.totalCount} {result.type === "tech" ? "productos" : "anuncios"} coinciden con esta provincia.
                      {locationFilter.unknownCount > 0 && (
                        <> {locationFilter.unknownCount} sin ubicación identificada quedan fuera del filtro.</>
                      )}
                    </p>
                  </div>
                  <button onClick={() => changeLocation(false, "")}>Quitar filtro de ubicación</button>
                </div>
              )}

              <SourceStatus sources={result.sources} />
              {result.database?.configured && result.database.count > 0 ? (
                <div className="databaseNotice">
                  <b>Base PrecioCR:</b> {result.database.count} dato{result.database.count === 1 ? "" : "s"} manual{result.database.count === 1 ? "" : "es"} incluido{result.database.count === 1 ? "" : "s"} en este análisis.
                </div>
              ) : null}
              {result.type === "car" && result.fx?.usdToCrc ? (
                <div className="fxNote">
                  Precios publicados en dólares se convierten a colones con una referencia de{" "}
                  <b>₡{new Intl.NumberFormat("es-CR", { maximumFractionDigits: 2 }).format(result.fx.usdToCrc)} por USD</b>
                  {" "}({result.fx.source}).
                </div>
              ) : null}
              <ExternalSources sources={result.externalSources} province={locationFilter?.province} />

              {result.type === "car" && <CarMarketBreakdown stats={result.stats} />}
              {result.type === "car" && result.spec?.year && (
                <YearAlternatives offers={result.alternatives} requestedYear={result.spec.year} />
              )}

              {(result.type === "car"
                ? result.stats.validCount > 0
                : result.stats.count > 0) ? (
                <>
                  {result.type === "car" && result.stats.needsYear ? (
                    <div className="yearRequired">
                      <div>
                        <span className="eyebrow">PARA CALCULAR EL PRECIO JUSTO</span>
                        <h3>Incluye el año del vehículo.</h3>
                        <p>
                          Encontramos anuncios, pero no mezclamos años diferentes para darte una cifra engañosa.
                        </p>
                      </div>
                      <button onClick={() => document.getElementById("buscador")?.scrollIntoView({ behavior: "smooth" })}>
                        Agregar año
                      </button>
                    </div>
                  ) : (
                    <div className="metricGrid">
                      <div className="metricCard">
                        <span>Precio más bajo válido</span>
                        <strong>{money(result.stats.lowest)}</strong>
                        <small>
                          {result.type === "car"
                            ? "Después de filtros de calidad."
                            : "Entre resultados comparables."}
                        </small>
                      </div>

                      <div className="metricCard">
                        <span>Precio típico balanceado</span>
                        <strong>{money(result.stats.median)}</strong>
                        <small>
                          {result.type === "car"
                            ? "Cada fuente pesa de forma más equilibrada."
                            : "Mediana de resultados."}
                        </small>
                      </div>

                      <div className="metricCard accentMetric">
                        <span>Buen objetivo de compra</span>
                        <strong>{money(result.stats.buyTarget)}</strong>
                        <small>Referencia calculada por PrecioCR.</small>
                      </div>
                    </div>
                  )}

                  <Score stats={result.stats} type={result.type} />

                  {result.type === "car" &&
                    !result.stats.needsYear &&
                    !result.stats.recommendationReady ? (
                      <div className="yearRequired dataWarning">
                        <div>
                          <span className="eyebrow">FALTAN DATOS COMPARABLES</span>
                          <h3>El año ya está correcto.</h3>
                          <p>
                            Encontramos muy pocos anuncios válidos de ese modelo y año para calcular un precio recomendado con confianza.
                          </p>
                        </div>
                      </div>
                    ) : null}

                  <div className="filterStack">
                    {result.type === "car" && (
                      <div className="sourceFilters marketFilters">
                        <button
                          className={groupFilter === "all" ? "active" : ""}
                          onClick={() => setGroupFilter("all")}
                        >
                          Todos los mercados
                        </button>
                        {["particular", "portal", "agencia"].map((group) => {
                          const count = result.offers.filter(
                            (x) => x.sourceGroup === group
                          ).length;

                          return (
                            <button
                              key={group}
                              className={groupFilter === group ? "active" : ""}
                              onClick={() => setGroupFilter(group)}
                            >
                              {GROUP_INFO[group].label} ({count})
                            </button>
                          );
                        })}
                      </div>
                    )}

                    <div className="sourceFilters">
                      <button
                        className={sourceFilter === "all" ? "active" : ""}
                        onClick={() => setSourceFilter("all")}
                      >
                        Todas las fuentes ({result.offers.length})
                      </button>

                      {availableSourceNames.map((name) => {
                        const count = result.offers.filter(
                          (x) => x.source === name
                        ).length;

                        return (
                          <button
                            key={name}
                            className={sourceFilter === name ? "active" : ""}
                            onClick={() => setSourceFilter(name)}
                          >
                            {name} ({count})
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="liveLayout">
                    <div className="panel liveOffersPanel">
                      <div className="panelHead">
                        <div>
                          <span className="eyebrow">RESULTADOS VERIFICABLES</span>
                          <h3>
                            {visibleOffers.length} ofertas visibles
                          </h3>
                        </div>
                      </div>

                      <div className="liveOffers">
                        {visibleOffers.length === 0 && (
                          <div className="offerFilterEmpty" role="status">
                            <p>No hay ofertas con esta combinación de fuente y mercado.</p>
                            <button onClick={() => { setSourceFilter("all"); setGroupFilter("all"); }}>
                              Mostrar todas las ofertas
                            </button>
                          </div>
                        )}
                        {visibleOffers.map((offer, i) => (
                          <OfferCard
                            key={`${offer.source}-${offer.url}-${offer.price}-${i}`}
                            offer={offer}
                            i={i}
                            type={result.type}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="sideStack">
                      <div className="panel recommendationCard">
                        <span className="eyebrow">
                          {result.type === "car" ? "PRECIO DE VENTA SUGERIDO" : "PRECIO TÍPICO"}
                        </span>
                        <h3>{money(result.stats.sellRecommended)}</h3>
                        <p>
                          {result.type === "car"
                            ? "Referencia balanceada entre las fuentes que superaron los filtros."
                            : "Referencia central de los precios encontrados."}
                        </p>
                        <div className="miniStat">
                          <span>Confianza</span>
                          <b>{result.stats.confidence}</b>
                        </div>
                      </div>

                      {result.type === "car" && (
                        <div className="panel methodologyCard">
                          <span className="eyebrow">POR QUÉ ES MÁS JUSTO</span>
                          <h3>No dejamos que una sola web mande.</h3>
                          <p>
                            Primero calculamos referencias por fuente y luego las balanceamos.
                            Así, 30 anuncios de un portal no pesan 30 veces más que una agencia.
                          </p>
                        </div>
                      )}

                      <div className="panel transparencyCard">
                        <span className="eyebrow">TRANSPARENCIA</span>
                        <h3>Siempre puedes verificar.</h3>
                        <p>
                          Cada resultado conserva su fuente y la Base PrecioCR se identifica por separado.
                          En autos y tecnología solo comparamos resultados compatibles con la búsqueda.
                        </p>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="noData">
                  <span className="noDataIcon">⌕</span>
                  <h3>
                    {locationFilter?.province
                      ? `No encontramos resultados confiables en ${locationFilter.province}.`
                      : "No encontramos suficientes resultados confiables."}
                  </h3>
                  <p>
                    {locationFilter?.province
                      ? "Puedes elegir otra provincia o quitar el filtro de ubicación para ampliar la búsqueda."
                      : result.type === "car"
                      ? "Prueba con marca + modelo + año, por ejemplo: Toyota RAV4 2024."
                      : "Prueba con marca + modelo + capacidad."}
                  </p>
                  <ExternalSources sources={result.externalSources} province={locationFilter?.province} />
                </div>
              )}
            </>
          )}
        </section>

        <section className="darkSection" id="como-funciona">
          <div className="shell">
            <div className="centerHead">
              <span className="eyebrow light">PRECIOCR V8</span>
              <h2>Autos y tecnología en una sola plataforma.</h2>
              <p>
                PrecioCR combina fuentes automáticas con Base PrecioCR para darte referencias más claras.
              </p>
            </div>

            <div className="steps">
              <div>
                <b>01</b>
                <h3>Normalizamos</h3>
                <p>Detectamos modelo, presentación y atributos relevantes según la categoría.</p>
              </div>
              <div>
                <b>02</b>
                <h3>Filtramos</h3>
                <p>Quitamos coincidencias débiles y evitamos mezclar categorías incompatibles.</p>
              </div>
              <div>
                <b>03</b>
                <h3>Comparamos</h3>
                <p>Mostramos fuentes, mediana y referencias de precio con Base PrecioCR incluida.</p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer>
        <div className="shell footerInner">
          <div className="brand">
            <span className="brandMark">₡</span>
            <span>Precio<span>CR</span></span>
          </div>
          <p>Autos + Tecnología · Costa Rica</p>
          <p>© 2026 PrecioCR · V8 beta</p>
        </div>
      </footer>
      {locationModalOpen && (
        <LocationModal
          type={type}
          initialLocation={locationLabel.split(" · ")[0] || province || "San José"}
          onClose={() => setLocationModalOpen(false)}
          onApply={applyLocation}
        />
      )}
    </>
  );
}
