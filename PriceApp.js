"use client";

import { useMemo, useState } from "react";
import { money, products } from "@/lib/data";

function MiniChart({ values }) {
  const width = 520, height = 150;
  const min = Math.min(...values), max = Math.max(...values);
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

function Score({ score, type }) {
  const text = score >= 90 ? "Excelente precio" : score >= 80 ? "Buen precio" : score < 60 ? "Precio alto" : "Precio normal";
  return (
    <div className="scoreCard">
      <div>
        <span className="eyebrow">PRECIOCR SCORE</span>
        <h3>{text}</h3>
        <p>
          {type === "car"
            ? "Referencia basada en precio, año, kilometraje y ofertas comparables."
            : "Referencia basada en modelo, variante, condición y ofertas comparables."}
        </p>
      </div>
      <div className="scoreCircle"><strong>{score}</strong><span>/100</span></div>
    </div>
  );
}

export default function PriceApp() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(products[0]);
  const [mode, setMode] = useState("comprar");
  const [condition, setCondition] = useState("9");
  const [category, setCategory] = useState("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter(p => {
      const matchesCategory = category === "all" || p.type === category;
      const matchesQuery = !q || `${p.name} ${p.category} ${p.summary}`.toLowerCase().includes(q);
      return matchesCategory && matchesQuery;
    });
  }, [query, category]);

  const conditionFactor = Number(condition) / 10;
  const adjustedSell = Math.round(selected.sellRecommended * conditionFactor / 1000) * 1000;

  const choose = (product) => {
    setSelected(product);
    setQuery(product.name);
    setCategory(product.type);
    setTimeout(() => document.getElementById("resultado")?.scrollIntoView({ behavior: "smooth" }), 20);
  };

  const selectCategory = (cat) => {
    setCategory(cat);
    setQuery("");
    const first = products.find(p => p.type === cat);
    if (first) setSelected(first);
  };

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
            <a href="#categorias">Autos</a>
            <a href="#categorias">Tecnología</a>
            <a href="#como-funciona">Cómo funciona</a>
          </div>
          <a className="navButton" href="#resultado">Comparar ahora</a>
        </nav>
      </header>

      <main id="top">
        <section className="hero">
          <div className="shell heroInner">
            <div className="badge">🇨🇷 Precios de autos y tecnología en Costa Rica</div>
            <h1>Compra al precio<br/><span>correcto.</span></h1>
            <p className="heroText">
              Compara carros y aparatos tecnológicos, detecta oportunidades y estima cuánto deberías pagar o vender.
            </p>

            <div className="categorySwitch" id="categorias">
              <button className={category === "all" ? "active" : ""} onClick={() => setCategory("all")}>Todo</button>
              <button className={category === "car" ? "active" : ""} onClick={() => selectCategory("car")}>🚗 Autos</button>
              <button className={category === "tech" ? "active" : ""} onClick={() => selectCategory("tech")}>📱 Tecnología</button>
            </div>

            <div className="searchBox">
              <span className="searchIcon">⌕</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={category === "car" ? "Busca Tucson 2024, Corolla 2021..." : category === "tech" ? "Busca iPhone 15, PS5, MacBook..." : "Busca un carro o aparato tecnológico..."}
              />
              <button onClick={() => filtered[0] && choose(filtered[0])}>Buscar precio</button>
            </div>

            {(query || category !== "all") && (
              <div className="searchDropdown">
                {filtered.length ? filtered.map(p => (
                  <button key={p.id} onClick={() => choose(p)}>
                    <span>{p.image}</span>
                    <span><strong>{p.name}</strong><small>{p.summary}</small></span>
                    <b>{money(p.lowest)}</b>
                  </button>
                )) : <div className="empty">Todavía no tenemos ese producto en la demo.</div>}
              </div>
            )}

            <div className="trustRow">
              <span>✓ Autos nuevos y usados</span>
              <span>✓ Tecnología nueva y usada</span>
              <span>✓ Precio recomendado para comprar o vender</span>
            </div>
          </div>
        </section>

        <section className="section shell" id="resultado">
          <div className="sectionHead">
            <div>
              <span className="eyebrow">{selected.type === "car" ? "AUTO ANALIZADO" : "PRODUCTO ANALIZADO"}</span>
              <h2>{selected.name}</h2>
              <p>{selected.summary}</p>
            </div>
            <div className="updated"><span className="liveDot"></span> Datos demostrativos</div>
          </div>

          <div className="tabs">
            <button className={mode === "comprar" ? "active" : ""} onClick={() => setMode("comprar")}>Quiero comprar</button>
            <button className={mode === "vender" ? "active" : ""} onClick={() => setMode("vender")}>Quiero vender</button>
          </div>

          {mode === "comprar" ? (
            <>
              <div className="metricGrid">
                <div className="metricCard"><span>Mejor precio encontrado</span><strong>{money(selected.lowest)}</strong><small>entre ofertas comparables</small></div>
                <div className="metricCard"><span>Promedio detectado</span><strong>{money(selected.average)}</strong><small>mercado analizado</small></div>
                <div className="metricCard accentMetric"><span>Comprar por debajo de</span><strong>{money(selected.buyMax)}</strong><small>nuestro precio objetivo</small></div>
              </div>

              <Score score={selected.score} type={selected.type} />

              <div className="contentGrid">
                <div className="panel">
                  <div className="panelHead">
                    <div><span className="eyebrow">OFERTAS</span><h3>Precios encontrados</h3></div>
                    <span className="count">{selected.offers.length} fuentes</span>
                  </div>
                  <div className="offers">
                    {selected.offers.map((offer, i) => (
                      <div className="offer" key={`${offer.store}-${i}`}>
                        <div className="storeLogo">{offer.store.slice(0,1)}</div>
                        <div className="offerMain">
                          <strong>{offer.store}</strong>
                          <span>{offer.condition} · {offer.meta} · Fuente: {offer.source}</span>
                        </div>
                        <div className="offerPrice">
                          <strong>{money(offer.price)}</strong>
                          <span className={offer.rating.includes("Excelente") ? "greenTag" : "softTag"}>{offer.rating}</span>
                        </div>
                      </div>
                    ))}
                  </div>
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
                <h3>{selected.type === "car" ? "Estado general del vehículo" : "Estado del producto"}</h3>
                <p className="muted">
                  {selected.type === "car"
                    ? "En la versión real también tomaremos en cuenta kilometraje, año, versión y transmisión."
                    : "En la versión real también tomaremos en cuenta batería, capacidad, accesorios y garantía."}
                </p>
                <div className="rangeHeader"><span>Estado</span><strong>{condition}/10</strong></div>
                <input className="range" type="range" min="5" max="10" step="1" value={condition} onChange={e => setCondition(e.target.value)} />
                <div className="conditionLabels"><span>Usado</span><span>Excelente</span></div>
              </div>

              <div className="panel sellResult">
                <span className="eyebrow">PRECIO RECOMENDADO</span>
                <h3>{money(adjustedSell)}</h3>
                <p>Referencia competitiva para publicar en Costa Rica.</p>
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
              <span className="eyebrow light">ENFOQUE INICIAL</span>
              <h2>Autos y tecnología. Nada más por ahora.</h2>
              <p>Esto nos permite comparar mejor productos con modelos, versiones y características identificables.</p>
            </div>
            <div className="steps">
              <div><b>01</b><h3>Identificamos</h3><p>Marca, modelo, año y versión en autos; modelo, capacidad y variante en tecnología.</p></div>
              <div><b>02</b><h3>Separamos</h3><p>No mezclamos nuevo con usado ni versiones diferentes en el mismo promedio.</p></div>
              <div><b>03</b><h3>Recomendamos</h3><p>Calculamos precio objetivo de compra, venta rápida y precio recomendado.</p></div>
            </div>
          </div>
        </section>
      </main>

      <footer>
        <div className="shell footerInner">
          <div className="brand"><span className="brandMark">₡</span><span>Precio<span>CR</span></span></div>
          <p>Autos + Tecnología · Costa Rica</p>
          <p>© 2026 PrecioCR · MVP</p>
        </div>
      </footer>
    </>
  );
}
