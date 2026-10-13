import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  ArrowRight,
  Bell,
  BookOpen,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Cpu,
  Download,
  ExternalLink,
  Globe2,
  History,
  Layers3,
  LayoutDashboard,
  Link2,
  LoaderCircle,
  LockKeyhole,
  Maximize2,
  MoreHorizontal,
  Play,
  Radio,
  Scale,
  Send,
  Settings2,
  ShieldCheck,
  ShieldOff,
  Sparkles,
  Target,
  TrendingUp,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import "./xau.css";
import Mt4Terminal from "./mt4.jsx";
const fmt = (n, digits = 2) =>
  new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n ?? 0);
const time = (value) =>
  new Date(value).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
async function api(path = "", body) {
  const response = await fetch(
    "/api/xau" + path,
    body === undefined
      ? undefined
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const result = await response.json();
  if (!response.ok) throw Error(result.error || "La requête a échoué.");
  return result;
}
const icons = [Globe2, Layers3, Target, Activity, Zap, TrendingUp];
function Pill({ value, children }) {
  return (
    <span className={"pill " + (value || "").toLowerCase()}>
      {children || value}
    </span>
  );
}
function Chart({ bars, tf, overlays, live = false }) {
  const [hover, setHover] = useState(null);
  if (!bars.length)
    return <div className="chart-loading">Chargement du graphique…</div>;
  const min = Math.min(...bars.map((b) => b.low)) - 3,
    max = Math.max(...bars.map((b) => b.high)) + 3;
  const y = (v) => 235 - ((v - min) / (max - min)) * 220;
  const last = bars.at(-1),
    item = hover === null ? last : bars[hover];
  let ema9 = bars[0].close,
    ema21 = ema9;
  const ema = bars.map((b, i) => {
    ema9 += (b.close - ema9) * 0.2;
    ema21 += ((b.close - ema21) * 2) / 22;
    return { x: 14 + i * 10, fast: y(ema9), slow: y(ema21) };
  });
  return (
    <div className="chart-wrap">
      <div className="ohlc">
        <b>Or / Dollar américain</b>
        <span>
          O <strong>{fmt(item.open)}</strong>
        </span>
        <span>
          H <strong>{fmt(item.high)}</strong>
        </span>
        <span>
          B <strong>{fmt(item.low)}</strong>
        </span>
        <span>
          C <strong className="positive">{fmt(item.close)}</strong>
        </span>
      </div>
      <svg
        viewBox="0 0 740 315"
        role="img"
        aria-label={`Chandeliers XAUUSD ${tf}, ${live ? "données MT4" : "données de démonstration"}`}
        onMouseLeave={() => setHover(null)}
      >
        {Array.from({ length: 6 }, (_, i) => {
          const price = min + ((max - min) * i) / 5;
          return (
            <g key={i}>
              <line
                x1="0"
                x2="659"
                y1={y(price)}
                y2={y(price)}
                stroke="#edf0f1"
                strokeDasharray="3 4"
              />
              <text x="675" y={y(price) + 4} className="axis">
                {fmt(price)}
              </text>
            </g>
          );
        })}
        {overlays && (
          <>
            <rect
              x="300"
              y={y(min + 12)}
              width="355"
              height="21"
              fill="#e9f3ed"
            />
            <text x="306" y={y(min + 12) + 14} fontSize="8" fill="#86a793">
              Zone illustrative · order block H1
            </text>
            <path
              d={ema
                .map((p, i) => `${i ? "L" : "M"}${p.x} ${p.fast}`)
                .join(" ")}
              fill="none"
              stroke="#c59e52"
              strokeWidth="1.3"
            />
            <path
              d={ema
                .map((p, i) => `${i ? "L" : "M"}${p.x} ${p.slow}`)
                .join(" ")}
              fill="none"
              stroke="#8092b8"
              strokeWidth="1.3"
            />
          </>
        )}
        {bars.map((b, i) => (
          <g key={i} onMouseEnter={() => setHover(i)}>
            <rect
              x={9 + i * 10}
              y="0"
              width="10"
              height="279"
              fill="transparent"
            />
            <line
              x1={14 + i * 10}
              x2={14 + i * 10}
              y1={y(b.high)}
              y2={y(b.low)}
              stroke={b.close >= b.open ? "#319782" : "#d17c7d"}
            />
            <rect
              x={11 + i * 10}
              y={Math.min(y(b.open), y(b.close))}
              width="6"
              height={Math.max(1, Math.abs(y(b.open) - y(b.close)))}
              fill={b.close >= b.open ? "#319782" : "#d17c7d"}
            />
            <rect
              x={11 + i * 10}
              y={281 - b.volume / 16}
              width="6"
              height={b.volume / 16}
              fill={b.close >= b.open ? "#c4e0d7" : "#eed3d2"}
            />
            {i % 12 === 0 && (
              <text x={10 + i * 10} y="304" className="axis">
                {tf === "D1"
                  ? new Date(b.time).toLocaleDateString("fr-FR", {
                      day: "2-digit",
                      month: "short",
                    })
                  : time(b.time)}
              </text>
            )}
          </g>
        ))}
        <line
          x1="0"
          x2="665"
          y1={y(last.close)}
          y2={y(last.close)}
          stroke="#2c8d75"
          strokeDasharray="4 4"
        />
        <rect
          x="666"
          y={y(last.close) - 10}
          width="74"
          height="21"
          rx="3"
          fill="#27856f"
        />
        <text x="671" y={y(last.close) + 4} fontSize="10" fill="white">
          {fmt(last.close)}
        </text>
        {hover !== null && (
          <line
            x1={14 + hover * 10}
            x2={14 + hover * 10}
            y1="0"
            y2="280"
            stroke="#9ba6ad"
            strokeDasharray="3 3"
          />
        )}
      </svg>
      <div className="chart-legend">
        {overlays && (
          <>
            <span>
              <i className="gold-dot" /> EMA 9
            </span>
            <span>
              <i className="blue-dot" /> EMA 21
            </span>
          </>
        )}
        <span>Volume ticks</span>
        <span className="push">
          {live ? "Bougies MT4 · UTC" : "12 oct. 2026 · UTC · Simulation"}
        </span>
      </div>
    </div>
  );
}
function Modal({ title, children, close }) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    ref.current?.focus();
    const handler = (e) => {
      if (e.key === "Escape") close();
      if (e.key === "Tab") {
        const items = ref.current.querySelectorAll(
          'button,input,select,a[href],[tabindex="0"]',
        );
        const first = items[0],
          last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      previous?.focus();
    };
  }, [close]);
  return (
    <div className="modal-backdrop" onClick={close}>
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={ref}
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <h2>{title}</h2>
          <button className="icon-button" aria-label="Fermer" onClick={close}>
            <X size={20} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
function App() {
  const [desk, setDesk] = useState(null),
    [bars, setBars] = useState([]),
    [tf, setTf] = useState("M15"),
    [page, setPage] = useState("Vue d’ensemble"),
    [modal, setModal] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [overlays, setOverlays] = useState(true),
    [clock, setClock] = useState(new Date());
  const closeModal = useCallback(() => setModal(null), []);
  useEffect(() => {
    api()
      .then(setDesk)
      .catch((e) => setError(e.message));
    const timer = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    let active = true;
    api("/candles?tf=" + tf)
      .then((data) => {
        if (active) setBars(data);
      })
      .catch((e) => setError(e.message));
    return () => {
      active = false;
    };
  }, [tf]);
  async function act(path, body = {}, message) {
    setBusy(true);
    setError("");
    try {
      const updated = await api(path, body);
      setDesk(updated);
      if (path === "/analyze") setNotice(updated.analyses[0].execution.reason);
      else if (message) setNotice(message);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const d = desk?.decision,
    open = desk?.orders.filter((o) => o.status === "open") || [];
  const nav = [
    ["Vue d’ensemble", LayoutDashboard],
    ["Les 6 agents", Cpu],
    ["Journal de trading", BookOpen],
    ["Gestion du risque", ShieldCheck],
  ];
  function download() {
    const data = JSON.stringify(
      { mode: "demo", analyses: desk.analyses, orders: desk.orders },
      null,
      2,
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([data], { type: "application/json" }),
    );
    a.download = "aurum-journal.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }
  return (
    <div className="app">
      <aside className="sidebar">
        <a className="brand" href="/">
          <div className="brand-symbol">
            <Layers3 size={24} />
          </div>
          <span>
            aurum<span className="brand-period">.</span>
            <small>INTELLIGENCE TRADING</small>
          </span>
        </a>
        <div className="workspace">
          <div className="workspace-icon">A</div>
          <div>
            Mon espace de trading<small>Compte personnel</small>
          </div>
          <ChevronDown size={14} />
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {nav.map(([label, Icon]) => (
            <button
              key={label}
              className={page === label ? "active" : ""}
              onClick={() => setPage(label)}
            >
              <Icon size={18} />
              {label}
              {label === "Les 6 agents" && <span className="nav-count">6</span>}
            </button>
          ))}
        </nav>
        <div className="nav-label connection-label">CONNEXIONS</div>
        <nav>
          <button onClick={() => setPage("Terminal MT4")}>
            <Link2 size={18} />
            MetaTrader 4<span className="tiny-dot muted-dot" />
          </button>
          <button onClick={() => setModal("telegram")}>
            <Send size={17} />
            Telegram
            <ChevronRight size={14} className="push" />
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="system-status">
            <div>
              <span className="tiny-dot" />{" "}
              {page === "Terminal MT4"
                ? "Connexion au broker"
                : "Environnement démo"}
            </div>
            <p>
              {page === "Terminal MT4"
                ? "Vérifiez le type de compte dans le terminal avant d’armer le juge."
                : "Explorez votre stratégie sans engager de capital."}
            </p>
            <button onClick={() => setModal("help")}>
              Découvrir le fonctionnement <ArrowUpRight size={14} />
            </button>
          </div>
          <button
            className="sidebar-settings"
            onClick={() => setModal("settings")}
          >
            <Settings2 size={17} />
            Paramètres
          </button>
          <div className="user">
            <div className="avatar">TR</div>
            <div>
              Trader<small>Espace personnel</small>
            </div>
            <button aria-label="Aide" onClick={() => setModal("help")}>
              <CircleHelp size={18} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <ChevronRight size={13} />
            <span>{page}</span>
          </div>
          <div className="topbar-right">
            <span className="clock">
              <Clock3 size={14} />
              {clock.toLocaleTimeString("fr-FR", { timeZone: "UTC" })}{" "}
              <span>UTC</span>
            </span>
            <span className="top-divider" />
            <button className="demo-switch" onClick={() => setModal("help")}>
              <span className="tiny-dot" />
              {page === "Terminal MT4" ? "Terminal MT4" : "Mode démo"}
              <ChevronDown size={13} />
            </button>
            <button
              className="icon-button"
              aria-label="Notifications"
              onClick={() => setModal("notifications")}
            >
              <Bell size={18} />
              <i className="notification-dot" />
            </button>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">VOTRE EDGE, AUGMENTÉ PAR L’IA</div>
              <h1>
                {page === "Vue d’ensemble"
                  ? "Le marché. Six perspectives."
                  : page}
              </h1>
              <p>
                Six agents spécialisés. Un juge impartial. Des décisions
                éclairées.
              </p>
            </div>
            <button
              className="button primary"
              onClick={() => setPage("Terminal MT4")}
            >
              <Link2 size={16} />
              Connecter MT4
              <ArrowUpRight size={16} />
            </button>
          </div>
          {error && (
            <div className="alert error" role="alert">
              {error}
              <button aria-label="Fermer l’erreur" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div className="alert success" role="status">
              {notice}
              <button
                aria-label="Fermer la notification"
                onClick={() => setNotice("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {page === "Terminal MT4" ? (
            <Mt4Terminal Chart={Chart} />
          ) : !desk ? (
            <div className="loading">
              <LoaderCircle className="spin" /> Chargement du poste de trading…
              {error && (
                <button onClick={() => location.reload()}>Réessayer</button>
              )}
            </div>
          ) : (
            <>
              <div className="metrics">
                <div className="metric">
                  <span>
                    Solde du compte <Wallet size={14} />
                  </span>
                  <strong>
                    {fmt(desk.balance)} <small>USD</small>
                  </strong>
                  <div>
                    <span className="positive">Compte de simulation</span>
                    <span className="mini-spark">▁▂▂▃▂▄▅▄▆▇</span>
                  </div>
                </div>
                <div className="metric">
                  <span>
                    P&L réalisé <TrendingUp size={14} />
                  </span>
                  <strong>
                    0,00 <small>USD</small>
                  </strong>
                  <div>
                    <span className="muted">Prix de démonstration fixes</span>
                  </div>
                </div>
                <div className="metric">
                  <span>
                    Positions ouvertes <Layers3 size={14} />
                  </span>
                  <strong>
                    {open.length.toString().padStart(2, "0")}
                    <small className="metric-note"> / 1 maximum</small>
                  </strong>
                  <div>
                    <span className="tiny-dot" />{" "}
                    {open.length
                      ? "Position simulée en cours"
                      : "En attente d’un signal"}
                  </div>
                </div>
                <div className="metric">
                  <span>
                    Protection du capital <ShieldCheck size={14} />
                  </span>
                  <strong className={desk.halted ? "negative" : "protection"}>
                    {desk.halted ? "Suspendu" : "Protégé"}
                    <span
                      className={"status-square " + (desk.halted ? "red" : "")}
                    >
                      <ShieldCheck size={19} />
                    </span>
                  </strong>
                  <div>
                    <span className="muted">Risque par trade</span>
                    <b>{fmt(desk.settings.risk, 1)} %</b>
                  </div>
                </div>
              </div>
              {(page === "Vue d’ensemble" || page === "Les 6 agents") && (
                <div className="dashboard-grid">
                  <div className="left-column">
                    {page === "Vue d’ensemble" && (
                      <section className="panel market-panel">
                        <div className="market-header">
                          <div className="gold-icon">Au</div>
                          <div>
                            <h2>
                              XAUUSD <span className="instrument-tag">CFD</span>
                              <ChevronDown size={14} />
                            </h2>
                            <p>Or / Dollar américain</p>
                          </div>
                          <div className="quote">
                            <strong>{fmt(bars.at(-1)?.close)}</strong>
                            <span className="positive">
                              <ArrowUpRight size={13} />
                              {bars.length
                                ? `+${fmt(((bars.at(-1).close - bars[0].open) / bars[0].open) * 100)} %`
                                : ""}{" "}
                              <small>sur la période</small>
                            </span>
                          </div>
                          <span className="market-demo">
                            <span className="tiny-dot" />
                            Données simulées
                          </span>
                        </div>
                        <div className="chart-toolbar">
                          <div className="timeframes">
                            {["M1", "M5", "M15", "H1", "D1"].map((t) => (
                              <button
                                key={t}
                                className={tf === t ? "selected" : ""}
                                onClick={() => setTf(t)}
                              >
                                {t}
                              </button>
                            ))}
                          </div>
                          <span className="toolbar-separator" />
                          <button
                            className={overlays ? "overlay-enabled" : ""}
                            onClick={() => setOverlays(!overlays)}
                          >
                            <Settings2 size={14} />
                            Indicateurs
                          </button>
                          <button
                            className="push icon-button"
                            aria-label="Agrandir le graphique"
                            onClick={() => setModal("chart")}
                          >
                            <Maximize2 size={15} />
                          </button>
                        </div>
                        <Chart bars={bars} tf={tf} overlays={overlays} />
                        <div className="market-footer">
                          <span>
                            <span className="tiny-dot" /> Scénario Londres / New
                            York
                          </span>
                          <span>
                            Spread illustratif <b>0,24</b>
                            <span className="footer-divider" />
                            ATR M5 <b>3,20</b>
                          </span>
                        </div>
                      </section>
                    )}
                    <section className="agents-section">
                      <div className="section-heading">
                        <h2>
                          Le conseil des agents{" "}
                          <span className="count">06</span>
                        </h2>
                        <span>
                          <span className="tiny-dot" />
                          {desk.analyses[0]?.engine?.startsWith("OpenAI")
                            ? "Analyse IA"
                            : "Votes de démonstration"}
                        </span>
                      </div>
                      <div className="agent-grid">
                        {desk.agents.map((a, i) => {
                          const Icon = icons[i];
                          return (
                            <button
                              className="agent-card"
                              key={a.id}
                              onClick={() => setModal(a)}
                            >
                              <div className="agent-card-top">
                                <span className={"agent-icon icon-" + i}>
                                  <Icon size={18} />
                                </span>
                                <span className="timeframe-label">
                                  {a.id === "COR" ? "INTER-MARCHÉS" : a.id}
                                </span>
                                <Pill value={a.vote} />
                              </div>
                              <h3>{a.name}</h3>
                              <p>{a.subtitle}</p>
                              <div className="agent-tags">
                                {a.tags.map((t) => (
                                  <span key={t}>{t}</span>
                                ))}
                              </div>
                              <div className="confidence-label">
                                <span>Conviction</span>
                                <b>
                                  {a.confidence} <small>%</small>
                                </b>
                              </div>
                              <div className="confidence-track">
                                <i
                                  className={a.vote.toLowerCase()}
                                  style={{ width: a.confidence + "%" }}
                                />
                              </div>
                              <div className="agent-detail">
                                Voir l’analyse
                                <ArrowUpRight size={12} />
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  </div>
                  <div className="right-column">
                    <section className="panel judge-panel">
                      <div className="judge-header">
                        <div className="judge-icon">
                          <Scale size={19} />
                        </div>
                        <div>
                          <h2>Le juge</h2>
                          <p>L’impartialité, par conception.</p>
                        </div>
                        <Sparkles size={16} />
                      </div>
                      <div className="judge-body">
                        <div className="confluence-label">
                          SCORE DE CONFLUENCE <CircleHelp size={13} />
                        </div>
                        <div
                          className="gauge"
                          style={{ "--score": d.score * 3.6 + "deg" }}
                        >
                          <div>
                            <strong>
                              {d.score}
                              <small>/100</small>
                            </strong>
                            <span>
                              {d.action === "HOLD"
                                ? "EN OBSERVATION"
                                : "CONFLUENCE VALIDÉE"}
                            </span>
                          </div>
                        </div>
                        <div className="vote-summary">
                          <span>
                            <i className="tiny-dot" />
                            {d.buy} Buy
                          </span>
                          <span>
                            <i className="tiny-dot sell-dot" />
                            {d.sell} Sell
                          </span>
                          <span>
                            <i className="tiny-dot hold-dot" />
                            {d.hold} Hold
                          </span>
                        </div>
                        <div className={"verdict " + d.action.toLowerCase()}>
                          {d.action === "BUY" ? (
                            <ArrowUpRight size={20} />
                          ) : d.action === "SELL" ? (
                            <ArrowDownRight size={20} />
                          ) : (
                            <Clock3 size={20} />
                          )}
                          <div>
                            <small>VERDICT DU JUGE</small>
                            <b>
                              {d.action === "BUY"
                                ? "Biais acheteur"
                                : d.action === "SELL"
                                  ? "Biais vendeur"
                                  : "Attendre"}
                            </b>
                          </div>
                          <Pill value={d.action} />
                        </div>
                        <p className="judge-reason">{d.reason}</p>
                        <div className="trade-plan">
                          <div>
                            <span>Entrée indicative</span>
                            <b>{fmt(d.entry)}</b>
                          </div>
                          <div>
                            <span>
                              <i className="tiny-dot sell-dot" />
                              Stop loss
                            </span>
                            <b>{fmt(d.stop)}</b>
                          </div>
                          <div>
                            <span>
                              <i className="tiny-dot" />
                              Take profit
                            </span>
                            <b>{fmt(d.target)}</b>
                          </div>
                          <div className="rr-row">
                            <span>Ratio rendement / risque</span>
                            <strong>1 : {fmt(d.rr, 1)}</strong>
                          </div>
                        </div>
                        <button
                          className="button primary full"
                          disabled={busy || desk.halted}
                          onClick={() =>
                            act(
                              "/analyze",
                              {},
                              "Les six votes ont été actualisés.",
                            )
                          }
                        >
                          <Play size={14} />
                          {busy ? "Analyse en cours…" : "Lancer une analyse"}
                          {busy ? (
                            <LoaderCircle size={15} className="spin" />
                          ) : (
                            <ArrowRight size={15} />
                          )}
                        </button>
                        <p className="judge-reason">
                          Exécution automatique dès {desk.settings.threshold} %
                          de confluence, sous réserve des limites de risque.
                        </p>
                        {desk.analyses[0]?.execution && (
                          <p className="judge-reason" role="status">
                            Dernier cycle : {desk.analyses[0].execution.reason}
                          </p>
                        )}
                        <div className="judge-note">
                          <LockKeyhole size={11} />
                          Exécution virtuelle · aucun ordre réel
                        </div>
                      </div>
                    </section>
                    <section
                      className={
                        "panel breaker " + (desk.halted ? "halted" : "")
                      }
                    >
                      <div>
                        <ShieldCheck size={19} />
                        <h3>Circuit breaker</h3>
                        <span className="push">
                          <Pill value={desk.halted ? "SELL" : "BUY"}>
                            {desk.halted ? "Déclenché" : "Armé"}
                          </Pill>
                        </span>
                      </div>
                      <p>
                        Bloque immédiatement toute nouvelle entrée. Les
                        positions restent ouvertes.
                      </p>
                      <button
                        disabled={busy}
                        onClick={() =>
                          act(
                            desk.halted ? "/resume" : "/halt",
                            {},
                            desk.halted
                              ? "Simulation réactivée."
                              : "Coupe-circuit déclenché. Les nouvelles entrées sont bloquées.",
                          )
                        }
                      >
                        <ShieldOff size={14} />
                        {desk.halted
                          ? "Réactiver la simulation"
                          : "Suspendre le trading"}
                      </button>
                    </section>
                    <button
                      className="telegram-card"
                      onClick={() => setModal("telegram")}
                    >
                      <span className="telegram-icon">
                        <Send size={19} />
                      </span>
                      <span>
                        <b>Votre desk, partout.</b>
                        <small>Accéder depuis Telegram</small>
                      </span>
                      <ArrowUpRight size={17} />
                    </button>
                  </div>
                </div>
              )}
              {page === "Journal de trading" && (
                <section className="panel journal-panel">
                  <div className="section-heading">
                    <h2>
                      Journal de trading{" "}
                      <span className="count">{desk.orders.length}</span>
                    </h2>
                    <button className="button secondary" onClick={download}>
                      <Download size={15} />
                      Exporter
                    </button>
                  </div>
                  {!desk.orders.length ? (
                    <div className="empty">
                      <BookOpen size={32} />
                      <h3>Votre première décision commence ici.</h3>
                      <p>
                        Lancez une analyse : le juge exécutera automatiquement
                        si la confluence atteint le seuil.
                      </p>
                      <button
                        className="button primary"
                        onClick={() => setPage("Vue d’ensemble")}
                      >
                        Retour au dashboard
                        <ArrowRight size={15} />
                      </button>
                    </div>
                  ) : (
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Instrument</th>
                            <th>Sens</th>
                            <th>Lots</th>
                            <th>Entrée</th>
                            <th>Stop / Objectif</th>
                            <th>Statut</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {desk.orders.map((o) => (
                            <tr key={o.id}>
                              <td>
                                {new Date(o.createdAt).toLocaleDateString(
                                  "fr-FR",
                                )}
                                <small>{time(o.createdAt)}</small>
                              </td>
                              <td>
                                XAUUSD<small>Simulation</small>
                              </td>
                              <td>
                                <Pill value={o.action} />
                              </td>
                              <td>{fmt(o.lots)}</td>
                              <td>{fmt(o.entry)}</td>
                              <td>
                                {fmt(o.stop)} / {fmt(o.target)}
                              </td>
                              <td>
                                {o.status === "open"
                                  ? "Ouverte"
                                  : "Clôturée · P&L 0 $"}
                              </td>
                              <td>
                                {o.status === "open" && (
                                  <button
                                    className="button secondary"
                                    disabled={busy}
                                    onClick={() =>
                                      act(
                                        "/close",
                                        { id: o.id },
                                        "Position clôturée au prix simulé, P&L nul.",
                                      )
                                    }
                                  >
                                    Clôturer
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <div className="history-list">
                    <h3>Historique des analyses</h3>
                    {!desk.analyses.length ? (
                      <p>Aucune analyse enregistrée.</p>
                    ) : (
                      desk.analyses.map((a) => (
                        <div key={a.id}>
                          <Clock3 size={16} />
                          <span>
                            {new Date(a.createdAt).toLocaleString("fr-FR")}
                            <small>{a.engine}</small>
                          </span>
                          <b>{a.decision.score} %</b>
                          <Pill value={a.decision.action} />
                        </div>
                      ))
                    )}
                  </div>
                </section>
              )}
              {page === "Gestion du risque" && (
                <section className="panel risk-page">
                  <ShieldCheck size={32} />
                  <h2>Le capital d’abord.</h2>
                  <p>
                    Les limites sont contrôlées par le serveur avant chaque
                    ordre simulé.
                  </p>
                  <div className="risk-rules">
                    <div>
                      <span>Risque par position</span>
                      <b>{fmt(desk.settings.risk, 1)} %</b>
                    </div>
                    <div>
                      <span>Seuil de confluence</span>
                      <b>{desk.settings.threshold} %</b>
                    </div>
                    <div>
                      <span>Ratio rendement / risque</span>
                      <b>1 : {fmt(desk.settings.rr, 1)}</b>
                    </div>
                    <div>
                      <span>Exposition maximale</span>
                      <b>1 position XAUUSD</b>
                    </div>
                    <div>
                      <span>Validité d’une analyse</span>
                      <b>5 minutes</b>
                    </div>
                    <div>
                      <span>Stop loss illustratif</span>
                      <b>1,5 × ATR M5</b>
                    </div>
                  </div>
                  <button
                    className="button primary"
                    onClick={() => setModal("settings")}
                  >
                    Ajuster les paramètres
                    <Settings2 size={16} />
                  </button>
                  <p className="risk-disclaimer">
                    Simulation à prix fixe : les sorties sur stop / objectif et
                    le suivi des pertes ne sont pas automatisés. Le
                    coupe-circuit de cette version est manuel.
                  </p>
                </section>
              )}
              {page === "Vue d’ensemble" && (
                <section className="panel bottom-strip">
                  <div className="calendar-icon">
                    <Clock3 size={18} />
                  </div>
                  <div>
                    <b>Calendrier économique</b>
                    <span>Le contexte macro avant chaque décision.</span>
                  </div>
                  <Pill value="HOLD">Non connecté</Pill>
                  <p>
                    Connectez un flux calendrier pour filtrer les annonces à
                    fort impact.
                  </p>
                  <button
                    className="icon-button"
                    aria-label="Voir les sources"
                    onClick={() => setModal("help")}
                  >
                    <ArrowUpRight size={17} />
                  </button>
                </section>
              )}
              <footer className="page-footer">
                <span>
                  <span className="tiny-dot" />
                  Aurum Trading Intelligence{" "}
                  <span className="footer-dot">·</span> Espace de démonstration
                </span>
                <span>
                  Données synthétiques ·{" "}
                  {desk.ai ? "IA connectée" : "Votes simulés"}
                  <span className="footer-dot">·</span>
                  <button onClick={() => setModal("help")}>
                    Guide du desk <ArrowUpRight size={12} />
                  </button>
                </span>
              </footer>
            </>
          )}
        </main>
      </div>
      {modal && (
        <Modal
          title={
            typeof modal === "object"
              ? `${modal.id} · ${modal.name}`
              : {
                  mt4: "Connecter MetaTrader 4",
                  telegram: "Votre desk sur Telegram",
                  settings: "Paramètres du risque",
                  chart: "XAUUSD · Graphique",
                  help: "Bienvenue sur Aurum",
                  notifications: "Centre de notifications",
                }[modal]
          }
          close={closeModal}
        >
          {typeof modal === "object" ? (
            <div className="agent-modal">
              <Pill value={modal.vote} />
              <h3>{modal.subtitle}</h3>
              <p>{modal.summary}</p>
              <h4>Périmètre d’analyse</h4>
              <p>{modal.focus}</p>
              <div className="modal-info">
                Conviction : {modal.confidence} % ·{" "}
                {desk.analyses[0]?.engine || "Scénario de démonstration"}. Ce
                score n’est pas une probabilité de réussite.
              </div>
            </div>
          ) : modal === "chart" ? (
            <Chart bars={bars} tf={tf} overlays={overlays} />
          ) : modal === "settings" ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const values = new FormData(e.currentTarget);
                act(
                  "/settings",
                  {
                    risk: Number(values.get("risk")),
                    threshold: Number(values.get("threshold")),
                    rr: Number(values.get("rr")),
                  },
                  "Paramètres enregistrés.",
                );
                setModal(null);
              }}
            >
              <p>Ces limites s’appliquent à chaque nouvelle entrée simulée.</p>
              <label>
                Risque par trade (%)
                <input
                  name="risk"
                  type="number"
                  min="0.1"
                  max="2"
                  step="0.1"
                  defaultValue={desk.settings.risk}
                  required
                />
              </label>
              <label>
                Confluence minimale (%)
                <input
                  name="threshold"
                  type="number"
                  min="75"
                  max="100"
                  step="1"
                  defaultValue={desk.settings.threshold}
                  required
                />
              </label>
              <label>
                Objectif rendement / risque
                <input
                  name="rr"
                  type="number"
                  min="1"
                  max="5"
                  step="0.1"
                  defaultValue={desk.settings.rr}
                  required
                />
              </label>
              <button className="button primary full" type="submit">
                Enregistrer les paramètres
                <Check size={16} />
              </button>
            </form>
          ) : modal === "telegram" ? (
            <div className="connection-content">
              <div className="connection-hero">
                <Send size={28} />
                <Pill value={desk?.telegram?.connected ? "BUY" : "HOLD"}>
                  {desk?.telegram?.connected ? "Connecté" : "À configurer"}
                </Pill>
              </div>
              <p>
                Consultez les verdicts du juge, le statut du compte et l’état du
                coupe-circuit depuis Telegram.
              </p>
              <ol>
                <li>
                  Créez votre bot auprès de{" "}
                  <a
                    href="https://t.me/BotFather"
                    target="_blank"
                    rel="noreferrer"
                  >
                    @BotFather <ExternalLink size={12} />
                  </a>
                  .
                </li>
                <li>
                  Ajoutez TELEGRAM_BOT_TOKEN et TELEGRAM_CHAT_ID au fichier .env
                  du serveur. Votre chat privé est le seul autorisé.
                </li>
                <li>
                  Redémarrez le serveur, puis envoyez /start à votre bot en
                  conversation privée.
                </li>
              </ol>
              <div className="modal-info">
                /statut et /juge affichent le compte MT4 associé, ou la
                simulation si aucun terminal n’est associé. /stop déclenche le
                coupe-circuit MT4. Aucune commande Telegram ne peut ouvrir un
                ordre.
              </div>
              <button
                className="button secondary full"
                onClick={() => setModal(null)}
              >
                Compris
                <Check size={15} />
              </button>
            </div>
          ) : modal === "notifications" ? (
            <div className="notification-list">
              <ShieldCheck size={24} />
              <h3>Votre espace démo est prêt.</h3>
              <p>
                Les cours de la vue démo sont des exemples. Consultez MetaTrader
                4 pour connaître l’état du terminal, des analyses et des ordres
                du broker.
              </p>
              {desk?.halted && (
                <div className="modal-info">
                  Le coupe-circuit est déclenché. Toute nouvelle entrée est
                  bloquée.
                </div>
              )}
            </div>
          ) : (
            <div className="guide">
              <p>
                Aurum rassemble six perspectives sur l’or : macro D1, structure
                H1, liquidité M15, timing M5, microstructure M1 et corrélations
                inter-marchés.
              </p>
              <h3>Un juge à poids égaux</h3>
              <p>
                Chaque vote compte pour 1/6. Le score mesure l’accord sur le
                sens majoritaire. Une égalité ou une confluence insuffisante
                donne HOLD.
              </p>
              <h3>Un environnement de démonstration</h3>
              <p>
                Les prix, zones et indicateurs sont illustratifs. Le bouton
                d’analyse enregistre les six votes et déclenche automatiquement
                l’ordre simulé si la confluence atteint au moins 75 % et les
                limites de risque le permettent ; avec une clé OpenAI côté
                serveur, chaque agent produit sa propre analyse des données
                synthétiques.
              </p>
              <h3>Avant de connecter le réel</h3>
              <p>
                La page MetaTrader 4 utilise le pont AurumBridge et le relais
                Windows. Connectez le terminal, le calendrier et les flux
                DXY/taux, puis armez le juge. Le mot de passe broker est saisi
                uniquement dans MT4. Le bot Telegram nécessite sa configuration
                côté serveur.
              </p>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
