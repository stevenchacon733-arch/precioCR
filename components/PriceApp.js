"use client";

import { useMemo, useState } from "react";

const money = (value) =>
  value == null
    ? "—"
    : new Intl.NumberFormat("es-CR", {
        style: "currency",
        currency: "CRC",
        maximumFractionDigits: 0,
      }).format(value);

const formatTime = (iso) => {
  if (!iso) return "";
  return new Intl.DateTimeFormat("es-CR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
};

function Score({ stats }) {
  if (!stats?.score) {
    const visibleOffers =
    result?.offers?.filter(
      (offer) => sourceFilter === "all" || offer.source === sourceFilter
    ) || [];

  const availableSourceNames = Array.from(
    new Set(result?.offers?.map((offer) => offer.source) || [])
  );

  return (
      <div className="scoreCard emptyScore">
        <div>
          <span className="eyebrow">PRECIOCR SCORE</span>
          <h3>Necesitamos más datos</h3>
          <p>El score aparece cuando encontramos suficientes precios comparables.</p>
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
        <span className="eyebrow">PRECIOCR SCORE · CONFIANZA {stats.confidence.toUpperCase()}</span>
        <h3>{label}</h3>
        <p>
          Calculado únicamente con los {stats.count} precios verificables encontrados en esta búsqueda.
        </p>
      </div>
      <div className="scoreCircle">
        <strong>{stats.score}</strong><span>/100</span>
      </div>
    </div>
  );
}

function SourceStatus({ sources = [] }) {
  return (
    <div className="sourceStatus">
      {sources.map((s) => (
        <a
          href={s.url}
          target="_blank"
          rel="noreferrer"
          key={s.source}
          className={s.count ? "sourcePill ok" : "sourcePill"}
        >
          <span className="statusDot" />
          <b>{s.source}</b>
          <small>{s.count ? `${s.count} resultado${s.count === 1 ? "" : "s"}` : s.error || "Sin resultados"}</small>
        </a>
      ))}
    </div>
  );
}

function OfferCard({ offer, i }) {
  return (
    <a className="liveOffer" href={offer.url} target="_blank" rel="noreferrer">
      <div className="offerRank">{String(i + 1).padStart(2, "0")}</div>
      <div className="offerInfo">
        <div className="offerSource">{offer.source}</div>
        <strong>{offer.title}</strong>
        <span>{[offer.condition, offer.meta].filter(Boolean).join(" · ")}</span>
      </div>
      <div className="offerPrice livePrice">
        <strong>{money(offer.price)}</strong>
        <span>Ver en fuente ↗</span>
      </div>
    </a>
  );
}

export default function PriceApp() {
  const [type, setType] = useState("car");
  const [query, setQuery] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");

  const examples = useMemo(
    () =>
      type === "car"
        ? ["Hyundai Tucson 2024", "Toyota RAV4 2024", "Toyota Corolla 2021"]
        : ["iPhone 15 128GB", "PlayStation 5 Slim", "Samsung Galaxy S24"],
    [type]
  );

  async function search(customQuery) {
    const q = (customQuery ?? query).trim();
    if (q.length < 2 || loading) return;

    setQuery(q);
    setLoading(true);
    setError("");
    setResult(null);
    setSourceFilter("all");

    try {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(q)}&type=${type}`,
        { cache: "no-store" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo completar la búsqueda.");
      setResult(data);
      setTimeout(
        () => document.getElementById("resultado")?.scrollIntoView({ behavior: "smooth" }),
        50
      );
    } catch (e) {
      setError(e.message || "No se pudo completar la búsqueda.");
    } finally {
      setLoading(false);
    }
  }

  function changeType(next) {
    setType(next);
    setQuery("");
    setResult(null);
    setError("");
    setSourceFilter("all");
  }

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
            <div className="badge">🇨🇷 Búsqueda en fuentes públicas de Costa Rica</div>
            <h1>Busca. Compara.<br/><span>Decide mejor.</span></h1>
            <p className="heroText">
              PrecioCR consulta fuentes disponibles al momento de tu búsqueda y te muestra exactamente de dónde sale cada precio.
            </p>

            <div className="categorySwitch">
              <button className={type === "car" ? "active" : ""} onClick={() => changeType("car")}>🚗 Autos</button>
              <button className={type === "tech" ? "active" : ""} onClick={() => changeType("tech")}>📱 Tecnología</button>
            </div>

            <div className="searchBox" id="buscador">
              <span className="searchIcon">⌕</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && search()}
                placeholder={type === "car" ? "Ej. Hyundai Tucson 2024" : "Ej. iPhone 15 128GB"}
              />
              <button onClick={() => search()} disabled={loading}>
                {loading ? "Buscando..." : "Buscar precio"}
              </button>
            </div>

            <div className="exampleRow">
              <span>Prueba:</span>
              {examples.map((x) => (
                <button key={x} onClick={() => search(x)}>{x}</button>
              ))}
            </div>

            {error && <div className="errorBox">{error}</div>}

            <div className="trustRow">
              <span>✓ Fuente y enlace visibles</span>
              <span>✓ Sin inventar precios faltantes</span>
              <span>✓ Recomendación solo con datos encontrados</span>
            </div>
          </div>
        </section>

        <section className="section shell" id="resultado">
          {!result && !loading && (
            <div className="preSearch">
              <span className="eyebrow">PRECIOCR V3</span>
              <h2>Haz una búsqueda para ver precios reales.</h2>
              <p>
                Autos consulta Encuentra24 y CRAutos. Tecnología consulta Walmart, Gollo, ExtremeTech, Intelec y Unimart. Marketplace se abre como búsqueda externa porque Facebook requiere inicio de sesión.
              </p>
            </div>
          )}

          {loading && (
            <div className="loadingState">
              <div className="loader" />
              <h2>Consultando fuentes…</h2>
              <p>Esto puede tardar unos segundos.</p>
            </div>
          )}

          {result && (
            <>
              <div className="sectionHead">
                <div>
                  <span className="eyebrow">{result.type === "car" ? "AUTO BUSCADO" : "TECNOLOGÍA BUSCADA"}</span>
                  <h2>{result.query}</h2>
                  <p>{result.stats.count} precios verificables · Consulta: {formatTime(result.fetchedAt)}</p>
                </div>
                <div className="updated"><span className="liveDot"></span> Consulta en vivo</div>
              </div>

              <SourceStatus sources={result.sources} />

              {!!result.externalSources?.length && (
                <div className="externalSearches">
                  <span>Buscar también en:</span>
                  {result.externalSources.map((source) => (
                    <a
                      key={source.name}
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                      className="marketplaceButton"
                    >
                      {source.name} ↗
                      <small>{source.note}</small>
                    </a>
                  ))}
                </div>
              )}

              {result.stats.count ? (
                <>
                  <div className="metricGrid">
                    <div className="metricCard">
                      <span>Precio más bajo encontrado</span>
                      <strong>{money(result.stats.lowest)}</strong>
                      <small>No necesariamente es la mejor condición.</small>
                    </div>
                    <div className="metricCard">
                      <span>Precio típico detectado</span>
                      <strong>{money(result.stats.median)}</strong>
                      <small>Mediana de los resultados encontrados.</small>
                    </div>
                    <div className="metricCard accentMetric">
                      <span>Buen objetivo de compra</span>
                      <strong>{money(result.stats.buyTarget)}</strong>
                      <small>Referencia calculada por PrecioCR.</small>
                    </div>
                  </div>

                  <Score stats={result.stats} />

                  <div className="liveLayout">
                    <div className="panel liveOffersPanel">
                      <div className="panelHead">
                        <div>
                          <span className="eyebrow">RESULTADOS VERIFICABLES</span>
                          <h3>Precios y fuentes</h3>
                        </div>
                        <span className="count">{result.offers.length} encontrados</span>
                      </div>

                      <div className="sourceFilters">
                        <button
                          className={sourceFilter === "all" ? "active" : ""}
                          onClick={() => setSourceFilter("all")}
                        >
                          Todas ({result.offers.length})
                        </button>
                        {availableSourceNames.map((name) => {
                          const count = result.offers.filter((x) => x.source === name).length;
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

                      <div className="liveOffers">
                        {visibleOffers.map((offer, i) => (
                          <OfferCard key={`${offer.source}-${offer.url}-${i}`} offer={offer} i={i} />
                        ))}
                      </div>
                    </div>

                    <div className="sideStack">
                      <div className="panel recommendationCard">
                        <span className="eyebrow">PARA VENDER</span>
                        <h3>{money(result.stats.sellRecommended)}</h3>
                        <p>
                          Referencia central basada en los precios que PrecioCR pudo verificar ahora.
                        </p>
                        <div className="miniStat">
                          <span>Confianza</span><b>{result.stats.confidence}</b>
                        </div>
                      </div>

                      <div className="panel transparencyCard">
                        <span className="eyebrow">TRANSPARENCIA</span>
                        <h3>No ocultamos la fuente.</h3>
                        <p>
                          Cada precio enlaza a su fuente. Marketplace se mantiene como búsqueda externa porque Facebook puede exigir inicio de sesión y no lo usamos para calcular el promedio hasta poder verificar sus anuncios de forma estable.
                        </p>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="noData">
                  <span className="noDataIcon">⌕</span>
                  <h3>No encontramos suficientes precios verificables.</h3>
                  <p>
                    Prueba con marca + modelo + año en autos, o marca + modelo + capacidad en tecnología.
                  </p>
                  <SourceStatus sources={result.sources} />
                </div>
              )}
            </>
          )}
        </section>

        <section className="darkSection" id="como-funciona">
          <div className="shell">
            <div className="centerHead">
              <span className="eyebrow light">CÓMO FUNCIONA V3</span>
              <h2>El precio sale de la fuente, no de una tabla inventada.</h2>
              <p>
                PrecioCR consulta páginas públicas, filtra coincidencias y calcula una referencia únicamente con los resultados que logra verificar.
              </p>
            </div>
            <div className="steps">
              <div><b>01</b><h3>Buscamos</h3><p>Consultamos las fuentes habilitadas para la categoría seleccionada.</p></div>
              <div><b>02</b><h3>Validamos</h3><p>Filtramos resultados por palabras del modelo y precios expresados en colones.</p></div>
              <div><b>03</b><h3>Calculamos</h3><p>Usamos mediana y percentiles para evitar que un precio extremo distorsione la recomendación.</p></div>
            </div>
          </div>
        </section>
      </main>

      <footer>
        <div className="shell footerInner">
          <div className="brand"><span className="brandMark">₡</span><span>Precio<span>CR</span></span></div>
          <p>Autos + Tecnología · Costa Rica</p>
          <p>© 2026 PrecioCR · V3 live beta</p>
        </div>
      </footer>
    </>
  );
}
