"use client";

import { useMemo, useState } from "react";
import { money, products } from "@/lib/data";

function MiniChart({ values }) {
  const width = 520;
  const height = 150;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((v - min) / Math.max(1, max - min)) * (height - 24) - 12;
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Historial de precios">
      <defs>
        <linearGradient id="fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#0e8f62" stopOpacity=".25" />
          <stop offset="100%" stopColor="#0e8f62" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline points={`0,${height} ${pts} ${width},${height}`} fill="url(#fill)" stroke="none" />
      <polyline points={pts} fill="none" stroke="#0e8f62" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Score({ score }) {
  let text = "Precio normal";
  if (score >= 90) text = "Excelente precio";
  else if (score >= 80) text = "Buen precio";
  else if (score < 60) text = "Precio alto";

  return (
    <div className="scoreCard">
      <div>
        <span className="eyebrow">PRECIOCR SCORE</span>
        <h3>{text}</h3>
        <p>Calculado a partir de ofertas comparables y el promedio detectado.</p>
      </div>
      <div className="scoreCircle">
        <strong>{score}</strong><span>/100</span>
      </div>
    </div>
  );
}

export default function PriceApp() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(products[0]);
  const [mode, setMode] = useState("comprar");
  const [condition, setCondition] = useState("9");
  const [showAll, setShowAll] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter(p =>
      `${p.name} ${p.category} ${p.summary}`.toLowerCase().includes(q)
    );
  }, [query]);

  const displayOffers = showAll ? selected.offers : selected.offers.slice(0, 3);
  const conditionFactor = Number(condition) / 10;
  const adjustedSell = Math.round(selected.sellRecommended * conditionFactor / 1000) * 1000;

  const choose = (product) => {
    setSelected(product);
    setQuery(product.name);
    setShowAll(false);
    setTimeout(() => document.getElementById("resultado")?.scrollIntoView({ behavior: "smooth" }), 20);
  };

  return (
    <>
      <header className="navWrap">
        <nav className="nav shell">
          <a className="brand" href="#top" aria-label="PrecioCR inicio">
            <span className="brandMark">₡</span>
            <span>Precio<span>CR</span></span>
          </a>
          <div className="navLinks">
            <a href="#resultado">Explorar</a>
            <a href="#categorias">Categorías</a>
            <a href="#como-funciona">Cómo funciona</a>
          </div>
          <a className="navButton" href="#resultado">Comparar ahora</a>
        </nav>
      </header>

      <main id="top">
        <section className="hero">
          <div className="heroGlow glowOne" />
          <div className="heroGlow glowTwo" />
          <div className="shell heroInner">
            <div className="badge">🇨🇷 Hecho para comprar mejor en Costa Rica</div>
            <h1>Descubre cuánto vale<br/><span>realmente.</span></h1>
            <p className="heroText">
              Compara precios, identifica buenas ofertas y calcula cuánto deberías pagar o pedir al vender.
            </p>

            <div className="searchBox">
              <span className="searchIcon">⌕</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Busca iPhone 15, PS5, freidora de aire..."
              />
              <button onClick={() => filtered[0] && choose(filtered[0])}>Buscar precio</button>
            </div>

            {query && (
              <div className="searchDropdown">
                {filtered.length ? filtered.map(p => (
                  <button key={p.id} onClick={() => choose(p)}>
                    <span>{p.image}</span>
                    <span><strong>{p.name}</strong><small>{p.summary}</small></span>
                    <b>{money(p.lowest)}</b>
                  </button>
                )) : (
                  <div className="empty">Todavía no tenemos ese producto en la demo.</div>
                )}
              </div>
            )}

            <div className="quickLinks" id="categorias">
              {["Tecnología", "Gaming", "Hogar", "Supermercado", "Autos", "Herramientas"].map(x =>
                <span key={x}>{x}</span>
              )}
            </div>

            <div className="trustRow">
              <span>✓ Fuentes visibles</span>
              <span>✓ Precios comparables</span>
              <span>✓ Recomendación de compra y venta</span>
            </div>
          </div>
        </section>

        <section className="section shell" id="resultado">
          <div className="sectionHead">
            <div>
              <span className="eyebrow">RESULTADO DE BÚSQUEDA</span>
              <h2>{selected.name}</h2>
              <p>{selected.summary}</p>
            </div>
            <div className="updated">
              <span className="liveDot"></span>
              Datos demostrativos
            </div>
          </div>

          <div className="tabs">
            <button className={mode === "comprar" ? "active" : ""} onClick={() => setMode("comprar")}>Quiero comprar</button>
            <button className={mode === "vender" ? "active" : ""} onClick={() => setMode("vender")}>Quiero vender</button>
          </div>

          {mode === "comprar" ? (
            <>
              <div className="metricGrid">
                <div className="metricCard">
                  <span>Mejor precio encontrado</span>
                  <strong>{money(selected.lowest)}</strong>
                  <small>entre ofertas comparables</small>
                </div>
                <div className="metricCard">
                  <span>Promedio detectado</span>
                  <strong>{money(selected.average)}</strong>
                  <small>mercado analizado</small>
                </div>
                <div className="metricCard accentMetric">
                  <span>Comprar por debajo de</span>
                  <strong>{money(selected.buyMax)}</strong>
                  <small>nuestro precio objetivo</small>
                </div>
              </div>

              <Score score={selected.score} />

              <div className="contentGrid">
                <div className="panel">
                  <div className="panelHead">
                    <div>
                      <span className="eyebrow">OFERTAS</span>
                      <h3>Precios encontrados</h3>
                    </div>
                    <span className="count">{selected.offers.length} fuentes</span>
                  </div>

                  <div className="offers">
                    {displayOffers.map((offer, i) => (
                      <div className="offer" key={`${offer.store}-${i}`}>
                        <div className="storeLogo">{offer.store.slice(0,1)}</div>
                        <div className="offerMain">
                          <strong>{offer.store}</strong>
                          <span>{offer.condition} · Fuente: {offer.source}</span>
                        </div>
                        <div className="offerPrice">
                          <strong>{money(offer.price)}</strong>
                          <span className={offer.rating.includes("Excelente") ? "greenTag" : "softTag"}>{offer.rating}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button className="outlineButton" onClick={() => setShowAll(!showAll)}>
                    {showAll ? "Ver menos" : "Ver todas las ofertas"}
                  </button>
                </div>

                <div className="panel">
                  <span className="eyebrow">HISTORIAL</span>
                  <h3>Cómo se ha movido el precio</h3>
                  <MiniChart values={selected.history} />
                  <div className="chartFooter">
                    <span>Hace 6 meses<br/><b>{money(selected.history[0])}</b></span>
                    <span>Precio actual<br/><b>{money(selected.history.at(-1))}</b></span>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="sellGrid">
              <div className="panel">
                <span className="eyebrow">ESTIMADOR DE VENTA</span>
                <h3>¿En qué estado está?</h3>
                <p className="muted">Ajustamos la recomendación según el estado del producto.</p>
                <div className="rangeHeader">
                  <span>Estado</span><strong>{condition}/10</strong>
                </div>
                <input className="range" type="range" min="5" max="10" step="1" value={condition} onChange={e => setCondition(e.target.value)} />
                <div className="conditionLabels"><span>Usado</span><span>Como nuevo</span></div>
              </div>

              <div className="panel sellResult">
                <span className="eyebrow">PRECIO RECOMENDADO</span>
                <h3>{money(adjustedSell)}</h3>
                <p>Una referencia competitiva para publicar tu producto.</p>
                <div className="sellBands">
                  <div><span>Venta rápida</span><b>{money(Math.round(adjustedSell * .9 / 1000) * 1000)}</b></div>
                  <div><span>Recomendado</span><b>{money(adjustedSell)}</b></div>
                  <div><span>Máximo razonable</span><b>{money(Math.round(adjustedSell * 1.07 / 1000) * 1000)}</b></div>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="darkSection" id="como-funciona">
          <div className="shell">
            <div className="centerHead">
              <span className="eyebrow light">CÓMO FUNCIONA</span>
              <h2>De muchos precios, una decisión clara.</h2>
              <p>PrecioCR convierte ofertas dispersas en una referencia fácil de entender.</p>
            </div>
            <div className="steps">
              <div><b>01</b><h3>Busca</h3><p>Escribe el producto exacto que quieres comprar o vender.</p></div>
              <div><b>02</b><h3>Comparamos</h3><p>Normalizamos variantes, condición y precios de fuentes disponibles.</p></div>
              <div><b>03</b><h3>Decide</h3><p>Recibes un rango de precio justo y nuestro PrecioCR Score.</p></div>
            </div>
          </div>
        </section>

        <section className="ctaSection">
          <div className="shell ctaCard">
            <div>
              <span className="eyebrow">PRECIOCR</span>
              <h2>Antes de comprar, revisa cuánto vale.</h2>
              <p>Empieza con cualquiera de los productos demo y prueba la experiencia.</p>
            </div>
            <button onClick={() => { setQuery("PlayStation 5 Slim"); choose(products[1]); }}>Probar una búsqueda</button>
          </div>
        </section>
      </main>

      <footer>
        <div className="shell footerInner">
          <div className="brand"><span className="brandMark">₡</span><span>Precio<span>CR</span></span></div>
          <p>El precio justo de Costa Rica.</p>
          <p>© 2026 PrecioCR · MVP demostrativo</p>
        </div>
      </footer>
    </>
  );
}
