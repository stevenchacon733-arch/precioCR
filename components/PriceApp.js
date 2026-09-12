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
          <span>Consultadas sin coincidencias para esta búsqueda:</span>
          <b>{reachableNoMatch.map((s) => s.source).join(" · ")}</b>
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

function ExternalSources({ sources = [] }) {
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

function OfferCard({ offer, i, type }) {
  return (
    <a className="liveOffer" href={offer.url} target="_blank" rel="noreferrer">
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
        <strong>{offer.title}</strong>
        <span>
          {type === "car"
            ? [
                offer.year,
                offer.km != null ? `${number(offer.km)} km` : null,
                offer.transmission,
                offer.fuel,
                offer.province,
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
        <span>Ver fuente ↗</span>
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
  const [groupFilter, setGroupFilter] = useState("all");

  const examples = useMemo(() => {
    if (type === "car") {
      return ["Toyota RAV4 2024", "Hyundai Tucson 2024", "Kia Sportage 2023"];
    }
    if (type === "tech") {
      return ["iPhone 15 128GB", "PlayStation 5 Slim", "Samsung Galaxy S24"];
    }
    return ["Creatina monohidratada", "Proteína whey", "Electrolitos"];
  }, [type]);

  async function search(customQuery) {
    const q = (customQuery ?? query).trim();
    if (q.length < 2 || loading) return;

    setQuery(q);
    setLoading(true);
    setError("");
    setResult(null);
    setSourceFilter("all");
    setGroupFilter("all");

    try {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(q)}&type=${type}`,
        { cache: "no-store" }
      );
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "No se pudo completar la búsqueda.");
      }

      setResult(data);
      setTimeout(
        () =>
          document
            .getElementById("resultado")
            ?.scrollIntoView({ behavior: "smooth" }),
        60
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
    setGroupFilter("all");
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

  const carStats = result?.type === "car" ? result?.stats : null;

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
            <button onClick={() => changeType("supplement")}>Suplementos</button>
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
              Autos, tecnología y suplementos deportivos básicos, con
              fuentes visibles y precios comparables.
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
              <button
                className={type === "supplement" ? "active" : ""}
                onClick={() => changeType("supplement")}
              >
                🥤 Suplementos
              </button>
            </div>

            <div className="searchBox" id="buscador">
              <span className="searchIcon">⌕</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && search()}
                placeholder={
                  type === "car"
                    ? "Ej. Toyota RAV4 2024"
                    : type === "tech"
                    ? "Ej. iPhone 15 128GB"
                    : "Ej. Creatina monohidratada"
                }
              />
              <button onClick={() => search()} disabled={loading}>
                {loading ? "Comparando..." : "Buscar precio"}
              </button>
            </div>

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

            {type === "supplement" && (
              <p className="yearTip">
                Esta sección se limita a suplementos básicos como proteína, creatina, electrolitos y vitaminas.
              </p>
            )}

            {error && <div className="errorBox">{error}</div>}

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
              <span className="eyebrow">PRECIOCR V6.1</span>
              <h2>
                {type === "car"
                  ? "Mercado automotor con varias fuentes."
                  : type === "tech"
                  ? "Compara tecnología en varias tiendas."
                  : "Compara suplementos deportivos básicos."}
              </h2>
              <p>
                {type === "car"
                  ? "Consultamos portales, agencias y Base PrecioCR."
                  : type === "supplement"
                  ? "Walmart, FitMart, Bionatural CR, Fitness Shop CR y Base PrecioCR cuando hay coincidencias verificables."
                  : "PrecioCR consulta las fuentes automáticas disponibles y conserva el enlace original."}
              </p>
            </div>
          )}

          {loading && (
            <div className="loadingState">
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
                      : result.type === "tech"
                      ? "TECNOLOGÍA BUSCADA"
                      : "SUPLEMENTO COMPARADO"}
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
              <ExternalSources sources={result.externalSources} />

              {result.type === "car" && <CarMarketBreakdown stats={result.stats} />}

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
                          Las categorías de suplementos y bienestar aplican filtros adicionales para mantener comparaciones apropiadas.
                        </p>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="noData">
                  <span className="noDataIcon">⌕</span>
                  <h3>No encontramos suficientes resultados confiables.</h3>
                  <p>
                    {result.type === "car"
                      ? "Prueba con marca + modelo + año, por ejemplo: Toyota RAV4 2024."
                      : result.type === "tech"
                      ? "Prueba con marca + modelo + capacidad."
                      : "Prueba con una categoría básica, por ejemplo creatina monohidratada o proteína whey."}
                  </p>
                  <ExternalSources sources={result.externalSources} />
                </div>
              )}
            </>
          )}
        </section>

        <section className="darkSection" id="como-funciona">
          <div className="shell">
            <div className="centerHead">
              <span className="eyebrow light">PRECIOCR V6.1</span>
              <h2>Autos, tecnología y suplementos en una sola plataforma.</h2>
              <p>
                Cada sección aplica reglas distintas para mantener comparaciones compatibles y fuentes transparentes.
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
          <p>Autos + Tecnología + Suplementos · Costa Rica</p>
          <p>© 2026 PrecioCR · V6.1 beta</p>
        </div>
      </footer>
    </>
  );
}
