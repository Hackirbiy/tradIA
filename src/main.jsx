import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  ArrowDownLeft,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  BrainCircuit,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Eye,
  Globe2,
  History,
  Layers,
  LayoutDashboard,
  LoaderCircle,
  LockKeyhole,
  Maximize2,
  MessageSquare,
  MoreHorizontal,
  Newspaper,
  Plus,
  Radio,
  Search,
  Settings2,
  ShieldCheck,
  ShieldOff,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import "./styles.css";
const money = (n, d = 2) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  }).format(n || 0);
const cls = (...x) => x.filter(Boolean).join(" ");
async function api(url, body) {
  const response = await fetch(
    "/api" + url,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : undefined,
  );
  const data = await response.json();
  if (!response.ok) throw Error(data.error || "Something went wrong");
  return data;
}
const roleIcons = {
  technical: Activity,
  fundamental: Newspaper,
  bull: TrendingUp,
  bear: TrendingDown,
  neutral: ScaleIcon,
};
function ScaleIcon(props) {
  return <Layers {...props} />;
}
function Sparkline({ positive = true, seed = 0 }) {
  return (
    <svg viewBox="0 0 90 32" className="sparkline">
      <path
        d={`M0 ${positive ? 26 : 8} L8 18 L15 22 L23 ${seed % 2 ? 13 : 19} L30 20 L37 10 L44 16 L50 ${positive ? 9 : 20} L57 13 L64 ${positive ? 5 : 23} L72 12 L80 ${positive ? 3 : 27} L90 ${positive ? 6 : 23}`}
        stroke={positive ? "#259978" : "#dc6c78"}
        strokeWidth="1.6"
        fill="none"
      />
    </svg>
  );
}
function Pill({ children, tone = "purple", dot = false }) {
  return (
    <span className={"pill " + tone}>
      {dot && <i />}
      {children}
    </span>
  );
}
function Chart({ context, range }) {
  const all = context.candles || [];
  const bucket = range === "1W" ? 4 : range === "1M" ? 8 : 1;
  const sampled = all
    .filter((_, i) => i % bucket === 0)
    .map((_, i) => {
      const group = all.slice(i * bucket, (i + 1) * bucket);
      return {
        open: group[0].open,
        close: group.at(-1).close,
        high: Math.max(...group.map((x) => x.high)),
        low: Math.min(...group.map((x) => x.low)),
        volume: group.reduce((n, x) => n + x.volume, 0) / bucket,
      };
    });
  const data =
    range === "1H" ? all.slice(-24) : range === "4H" ? all.slice(-40) : sampled;
  if (!data.length)
    return (
      <div className="chart-unavailable">
        <Activity size={30} />
        <h3>Current quote available</h3>
        <p>Historical candles aren’t included in this data feed.</p>
        <strong>{money(context.asset.price)}</strong>
      </div>
    );
  const low = Math.min(...data.map((d) => d.low)) * 0.997,
    high = Math.max(...data.map((d) => d.high)) * 1.003;
  const y = (v) => 225 - ((v - low) / (high - low)) * 195,
    step = 850 / data.length;
  return (
    <svg
      className="price-chart"
      viewBox="0 0 950 300"
      preserveAspectRatio="none"
      role="img"
      aria-label={`${context.asset.symbol} illustrative candlestick chart, ${range} view`}
    >
      <defs>
        <linearGradient id="chartFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#9b89dd" stopOpacity=".13" />
          <stop offset="100%" stopColor="#9b89dd" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 1, 2, 3, 4].map((i) => {
        const p = high - ((high - low) * i) / 4;
        return (
          <g key={i}>
            <line
              x1="0"
              x2="870"
              y1={y(p)}
              y2={y(p)}
              stroke="#eef0f4"
              strokeDasharray="3 4"
            />
            <text x="888" y={y(p) + 4} fill="#9298a5" fontSize="10">
              {p.toFixed(context.asset.type === "prediction" ? 3 : 2)}
            </text>
          </g>
        );
      })}
      <path
        d={data
          .map(
            (d, i) =>
              `${i ? "L" : "M"}${i * step + step / 2} ${y((d.open + d.close) / 2) + 10}`,
          )
          .join(" ")}
        stroke="#b5a7e2"
        strokeWidth="1.5"
        fill="none"
      />
      {data.map((d, i) => {
        const color = d.close >= d.open ? "#43a88d" : "#e58a93",
          x = i * step + step / 2;
        return (
          <g key={i}>
            <rect
              x={x - step * 0.3}
              y={269 - d.volume / 45}
              width={step * 0.6}
              height={d.volume / 45}
              fill={color}
              opacity=".23"
            />
            <line x1={x} x2={x} y1={y(d.high)} y2={y(d.low)} stroke={color} />
            <rect
              x={x - step * 0.25}
              y={Math.min(y(d.open), y(d.close))}
              width={step * 0.5}
              height={Math.max(2, Math.abs(y(d.open) - y(d.close)))}
              fill={color}
              rx="1"
            />
          </g>
        );
      })}
      <line
        x1="0"
        x2="876"
        y1={y(data.at(-1).close)}
        y2={y(data.at(-1).close)}
        stroke="#43a88d"
        strokeDasharray="4 4"
        opacity=".65"
      />
      <rect
        x="877"
        y={y(data.at(-1).close) - 10}
        width="66"
        height="21"
        fill="#299a79"
        rx="4"
      />
      <text
        x="910"
        y={y(data.at(-1).close) + 4}
        textAnchor="middle"
        fontSize="10"
        fill="white"
      >
        {data.at(-1).close.toFixed(2)}
      </text>
      {(range === "1W"
        ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
        : range === "1M"
          ? ["Week 1", "", "Week 2", "", "Week 3", "", "Week 4"]
          : ["09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30"]
      ).map((t, i) => (
        <text key={i} x={i * 138 + 10} y="293" fill="#9499a5" fontSize="10">
          {t}
        </text>
      ))}
    </svg>
  );
}
function App() {
  const [desk, setDesk] = useState(null),
    [context, setContext] = useState(null),
    [analysis, setAnalysis] = useState(null),
    [symbol, setSymbol] = useState("NVDA"),
    [page, setPage] = useState("Overview"),
    [marketTab, setMarketTab] = useState("Stocks"),
    [range, setRange] = useState("1D"),
    [analysisTab, setAnalysisTab] = useState("Agent debate"),
    [search, setSearch] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [toast, setToast] = useState(null),
    [modal, setModal] = useState(null),
    [risk, setRisk] = useState(null),
    [expanded, setExpanded] = useState(null),
    [chartFull, setChartFull] = useState(false);
  const notify = (text, error = false) => setToast({ text, error });
  const refresh = async () => {
    const d = await api("/desk");
    setDesk(d);
    return d;
  };
  useEffect(() => {
    refresh().catch((e) => notify(e.message, true));
    const interval = setInterval(() => refresh().catch(() => {}), 30000);
    return () => clearInterval(interval);
  }, []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setContext(null);
    setAnalysis(null);
    api("/market/" + symbol)
      .then((d) => {
        if (active) {
          setContext(d.context);
          setAnalysis(d.analysis);
          setDesk((old) => (old ? { ...old, account: d.account } : old));
        }
      })
      .catch((e) => {
        if (active) notify(e.message, true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [symbol]);
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement;
    const dialog = document.querySelector("[role=dialog]");
    const selector = "button:not(:disabled),a[href],input";
    const elements = () => [...dialog.querySelectorAll(selector)];
    elements()[0]?.focus();
    const onKey = (e) => {
      if (e.key === "Escape" && !busy) setModal(null);
      if (e.key === "Tab") {
        const focusable = elements(),
          first = focusable[0],
          last = focusable.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [modal, busy]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6500);
    return () => clearTimeout(t);
  }, [toast]);
  const select = (s) => {
    if (busy) return;
    setSymbol(s);
    setPage("Overview");
    setExpanded(null);
  };
  const run = async () => {
    setBusy(true);
    try {
      const d = await api("/analyze", { symbol });
      setAnalysis(d.analysis);
      setContext(d.analysis.context);
      await refresh();
      notify("Analysis complete. Your desk has reached a decision.");
    } catch (e) {
      notify(e.message, true);
    } finally {
      setBusy(false);
    }
  };
  const openTrade = async () => {
    if (!analysis?.id) {
      notify("Run an analysis first to create a fresh trade plan.");
      return;
    }
    try {
      setRisk(await api("/risk/" + analysis.id));
      setModal("trade");
    } catch (e) {
      notify(e.message, true);
    }
  };
  const execute = async () => {
    setBusy(true);
    try {
      await api("/orders", { analysisId: analysis.id });
      await refresh();
      setModal(null);
      notify("Paper position opened. Stops and limits are active.");
    } catch (e) {
      notify(e.message, true);
    } finally {
      setBusy(false);
    }
  };
  const cutoff = async () => {
    try {
      await api("/cutoff", {});
      await refresh();
      setModal(null);
      notify(
        "Emergency cutoff active. All paper positions closed at their last observed marks.",
      );
    } catch (e) {
      notify(e.message, true);
    }
  };
  const account = desk?.account,
    asset = context?.asset,
    decision = analysis?.decision;
  const filtered = (desk?.assets || []).filter(
    (a) =>
      (marketTab === "Stocks" ? a.type === "stock" : a.type === "prediction") &&
      `${a.symbol} ${a.name}`.toLowerCase().includes(search.toLowerCase()),
  );
  const change = account ? account.equity - 100000 : 0;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="tradIA home">
          <span className="brand-icon">
            <BarChart3 size={24} strokeWidth={2.5} />
          </span>
          trad<span>IA</span>
          <span className="beta">BETA</span>
        </a>
        <div className="workspace-label">WORKSPACE</div>
        <nav>
          {[
            [LayoutDashboard, "Overview"],
            [Wallet, "Portfolio"],
            [History, "Trade history"],
            [Globe2, "Markets"],
          ].map(([Icon, name]) => (
            <button
              key={name}
              className={cls("nav-item", page === name && "active")}
              onClick={() => setPage(name)}
            >
              <Icon size={18} />
              {name}
              {name === "Portfolio" && (
                <span className="nav-count">
                  {account?.positions.length || 0}
                </span>
              )}
              {name === "Overview" && <span className="active-dot" />}
            </button>
          ))}
        </nav>
        <div className="watchlist-heading">
          <span>WATCHLIST</span>
          <button
            className="icon-button"
            aria-label="Find an asset"
            onClick={() => {
              setPage("Markets");
              document.getElementById("asset-search")?.focus();
            }}
          >
            <Plus size={15} />
          </button>
        </div>
        <div className="side-watchlist">
          {(desk?.assets || [])
            .filter((a) => a.type === "stock")
            .slice(0, 4)
            .map((a) => (
              <button
                onClick={() => select(a.symbol)}
                key={a.symbol}
                className={cls("side-asset", symbol === a.symbol && "selected")}
              >
                <span className="ticker-dot" style={{ background: a.color }} />
                <span>{a.symbol}</span>
                <small className={a.change >= 0 ? "positive" : "negative"}>
                  {a.change >= 0 ? "+" : ""}
                  {a.change.toFixed(2)}%
                </small>
              </button>
            ))}
        </div>
        <div className="sidebar-bottom">
          <div className="paper-card">
            <div>
              <ShieldCheck size={17} />
              <strong>Paper trading only</strong>
              <span className="green-dot" />
            </div>
            <p>
              Real insights. Virtual capital.
              <br />
              Zero real-money risk.
            </p>
            <span className="paper-limit">
              <LockKeyhole size={12} /> Live execution disabled
            </span>
          </div>
          <button className="nav-item" onClick={() => setPage("Settings")}>
            <Settings2 size={18} />
            Settings & connections
          </button>
          <button className="nav-item" onClick={() => setModal("help")}>
            <CircleHelp size={18} />
            Help & documentation
            <ArrowUpRight size={14} />
          </button>
          <div className="profile">
            <span className="avatar">JD</span>
            <div>
              <strong>My trading desk</strong>
              <small>Personal workspace</small>
            </div>
            <button
              className="icon-button"
              aria-label="Workspace settings"
              onClick={() => setPage("Settings")}
            >
              <ChevronDown size={16} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            Workspace <ChevronRight size={13} />
            <strong>{page}</strong>
          </div>
          <div className="topbar-right">
            <span className="session-status">
              <span className="green-dot" /> Desk online
            </span>
            <span className="top-divider" />
            <button
              className="icon-button notification"
              aria-label="Notifications"
              onClick={() => setModal("notifications")}
            >
              <Bell size={18} />
              <i />
            </button>
            <span className="avatar small">JD</span>
          </div>
        </header>
        <main>
          <section className="page-heading">
            <div>
              <div className="eyebrow">YOUR EDGE, EXPLAINED.</div>
              <h1>
                {page === "Overview"
                  ? "Your AI trading desk"
                  : page === "Portfolio"
                    ? "Paper portfolio"
                    : page === "Trade history"
                      ? "Every call. Full context."
                      : page === "Markets"
                        ? "Explore the markets"
                        : "Settings & connections"}
              </h1>
              <p>
                {page === "Overview"
                  ? "Multiple perspectives. One informed decision. Always paper."
                  : page === "Portfolio"
                    ? "Track your positions, exposure, and virtual performance."
                    : page === "Trade history"
                      ? "A transparent record of your desk’s thinking and paper trades."
                      : page === "Markets"
                        ? "Follow stocks and the probabilities shaping the market."
                        : "Connect your research stack and make the desk your own."}
              </p>
            </div>
            <div className="heading-actions">
              <Pill tone="neutral" dot>
                {desk?.config.mode === "live" ? "Live data" : "Demo workspace"}
              </Pill>
              <button
                className="button secondary cutoff"
                onClick={() => setModal("cutoff")}
              >
                <ShieldOff size={15} />
                {account?.halted ? "Trading paused" : "Emergency cutoff"}
              </button>
            </div>
          </section>
          <section className="stats-grid">
            <Stat
              label="Portfolio value"
              value={money(account?.equity || 100000)}
              icon={Wallet}
              note={
                <>
                  <span className="positive">
                    {change >= 0 ? "+" : ""}
                    {money(change)}
                  </span>
                  <span> total return</span>
                </>
              }
            />
            <Stat
              label="Available capital"
              value={money(account?.cash ?? 100000)}
              icon={Layers}
              note="Ready for your next opportunity"
            />
            <Stat
              label="Open positions"
              value={String(account?.positions.length || 0).padStart(2, "0")}
              icon={BarChart3}
              note={
                <>
                  <span>
                    {account?.positions.filter((p) => p.type === "stock")
                      .length || 0}{" "}
                    stocks
                  </span>
                  <span className="mini-dot" />
                  {account?.positions.filter((p) => p.type === "prediction")
                    .length || 0}{" "}
                  prediction markets
                </>
              }
            />
            <Stat
              label="Risk status"
              value={account?.halted ? "Paused" : "Within limits"}
              icon={ShieldCheck}
              green={!account?.halted}
              note={
                <>
                  <span className={account?.halted ? "negative" : "positive"}>
                    ●
                  </span>{" "}
                  {account?.halted
                    ? "Emergency cutoff is active"
                    : "5% hard loss limit · Risk controls active"}
                </>
              }
            />
          </section>
          {page === "Overview" && (
            <>
              <section className="desk-grid">
                <div className="market-panel panel">
                  <div className="panel-title">
                    <h2>Markets</h2>
                    <button
                      className="icon-button"
                      aria-label="Browse all markets"
                      onClick={() => setPage("Markets")}
                    >
                      <MoreHorizontal size={18} />
                    </button>
                  </div>
                  <div className="segment">
                    <button
                      className={marketTab === "Stocks" ? "active" : ""}
                      onClick={() => setMarketTab("Stocks")}
                    >
                      Stocks
                    </button>
                    <button
                      className={marketTab === "Predictions" ? "active" : ""}
                      onClick={() => setMarketTab("Predictions")}
                    >
                      Predictions
                    </button>
                  </div>
                  <label className="search-field">
                    <Search size={14} />
                    <input
                      id="asset-search"
                      aria-label="Search markets"
                      placeholder="Search markets..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                    <span>
                      <Search size={10} />
                    </span>
                  </label>
                  <div className="market-list">
                    {filtered.map((a, i) => (
                      <button
                        key={a.symbol}
                        className={cls(
                          "market-row",
                          a.symbol === symbol && "selected",
                        )}
                        onClick={() => select(a.symbol)}
                      >
                        <span
                          className="asset-logo"
                          style={{ color: a.color, background: a.color + "13" }}
                        >
                          {a.symbol === "NVDA" ? (
                            <Eye size={20} />
                          ) : a.symbol === "AAPL" ? (
                            "a"
                          ) : a.symbol === "MSFT" ? (
                            <span className="ms-grid">
                              <i />
                              <i />
                              <i />
                              <i />
                            </span>
                          ) : (
                            a.symbol[0]
                          )}
                        </span>
                        <div className="asset-label">
                          <strong>{a.symbol}</strong>
                          <small>{a.short}</small>
                        </div>
                        <div className="market-price">
                          <strong>
                            {a.type === "prediction"
                              ? `${Math.round(a.price * 100)}¢`
                              : money(a.price)}
                          </strong>
                          <small
                            className={a.change >= 0 ? "positive" : "negative"}
                          >
                            {a.change >= 0 ? "+" : ""}
                            {a.change.toFixed(2)}%
                          </small>
                        </div>
                      </button>
                    ))}
                    {!filtered.length && (
                      <p className="empty-small">No matching markets.</p>
                    )}
                  </div>
                  <div className="market-foot">
                    <span className="green-dot" />
                    {desk?.config.mode === "live"
                      ? "Watchlist reference prices"
                      : "Simulated market data"}
                    <InfoDot />
                  </div>
                </div>
                <div
                  className={cls(
                    "chart-panel panel",
                    chartFull && "chart-full",
                  )}
                >
                  <div className="chart-heading">
                    <div className="chart-asset">
                      <span
                        className="asset-logo large"
                        style={{
                          background: (asset?.color || "#77aa35") + "13",
                          color: asset?.color,
                        }}
                      >
                        {symbol === "NVDA" ? <Eye size={27} /> : symbol[0]}
                      </span>
                      <div>
                        <div className="chart-title">
                          {symbol}
                          <Pill tone="neutral">
                            {asset?.type === "prediction"
                              ? "Prediction"
                              : "NASDAQ"}
                          </Pill>
                          <button
                            className="icon-button"
                            aria-label="Select another market"
                            onClick={() => setPage("Markets")}
                          >
                            <ChevronDown size={15} />
                          </button>
                        </div>
                        <p>{asset?.name || "Loading market…"}</p>
                      </div>
                    </div>
                    <div className="quote">
                      <strong>{asset ? money(asset.price) : "—"}</strong>
                      <span
                        className={asset?.change >= 0 ? "positive" : "negative"}
                      >
                        {asset?.change >= 0 ? (
                          <ArrowUpRight size={14} />
                        ) : (
                          <ArrowDownRight size={14} />
                        )}{" "}
                        {asset?.change >= 0 ? "+" : ""}
                        {asset?.change?.toFixed(2)}% <small>today</small>
                      </span>
                    </div>
                  </div>
                  <div className="chart-toolbar">
                    <div className="timeframes">
                      {["1H", "4H", "1D", "1W", "1M"].map((r) => (
                        <button
                          key={r}
                          className={range === r ? "active" : ""}
                          onClick={() => setRange(r)}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                    <div className="chart-tools">
                      <span>
                        <i className="chart-key" />
                        {context?.mode === "live"
                          ? "Current quote"
                          : "Illustrative price action"}
                      </span>
                      <button
                        className="icon-button"
                        aria-label={
                          chartFull ? "Minimize chart" : "Expand chart"
                        }
                        onClick={() => setChartFull(!chartFull)}
                      >
                        {chartFull ? <X size={15} /> : <Maximize2 size={15} />}
                      </button>
                    </div>
                  </div>
                  {loading ? (
                    <div className="chart-unavailable">
                      <LoaderCircle className="spin" />
                      <p>Gathering market context…</p>
                    </div>
                  ) : context ? (
                    <Chart context={context} range={range} />
                  ) : (
                    <div className="chart-unavailable">
                      <p>Market data unavailable. Check your connections.</p>
                    </div>
                  )}
                  <div className="chart-footer">
                    <span>
                      <span className="purple-dot" />
                      {context?.mode === "demo"
                        ? "Demo data · Illustrative session"
                        : `Quote as of ${new Date(context?.asOf || Date.now()).toLocaleString()}`}
                    </span>
                    <span>
                      Price in USD <ChevronDown size={12} />
                    </span>
                  </div>
                </div>
                <div className="decision-panel panel">
                  <div className="panel-title">
                    <h2>
                      <Sparkles size={17} />
                      Desk decision
                    </h2>
                    <Pill tone="purple">
                      {analysis?.id ? "Analyzed" : "Preview"}
                    </Pill>
                  </div>
                  <div className="decision-call">
                    <span
                      className={cls(
                        "call-icon",
                        decision?.action !== "BUY" && "hold",
                      )}
                    >
                      {decision?.action === "BUY" ? (
                        <ArrowUpRight size={25} />
                      ) : (
                        <Activity size={25} />
                      )}
                    </span>
                    <div>
                      <h3>
                        {decision?.action === "BUY"
                          ? "Buy"
                          : decision?.action === "SELL"
                            ? "Sell"
                            : "Hold"}{" "}
                        <span>{symbol}</span>
                      </h3>
                      <p>
                        {asset?.type === "prediction"
                          ? "YES contract · Paper only"
                          : "Long position · Swing trade"}
                      </p>
                    </div>
                  </div>
                  <div className="confidence-label">
                    <span>
                      Desk confidence <InfoDot />
                    </span>
                    <strong>
                      {decision?.confidence || 0}
                      <small>%</small>
                    </strong>
                  </div>
                  <div className="confidence-track">
                    <i style={{ width: `${decision?.confidence || 0}%` }} />
                  </div>
                  <p className="decision-summary">
                    {decision?.summary ||
                      "Choose a market to see the desk’s outlook."}
                  </p>
                  <div className="decision-meta">
                    <span>
                      <ShieldCheck size={14} />
                      Risk-managed
                    </span>
                    <span>
                      <Clock3 size={14} />
                      1–5 day horizon
                    </span>
                  </div>
                  <button
                    className="button primary run-button"
                    disabled={busy || loading || !context}
                    onClick={run}
                  >
                    {busy ? (
                      <LoaderCircle size={16} className="spin" />
                    ) : (
                      <Sparkles size={16} />
                    )}{" "}
                    {busy ? "The desk is deliberating…" : "Run analysis"}
                    {!busy && <ArrowRight size={16} />}
                  </button>
                  <button
                    className="text-button trade-link"
                    disabled={busy || account?.halted || !analysis?.id}
                    onClick={openTrade}
                  >
                    Create paper trade <ArrowUpRight size={14} />
                  </button>
                  <div className="decision-disclaimer">
                    <LockKeyhole size={11} />
                    {analysis?.engine === "OpenAI"
                      ? `${analysis.model} · Paper only`
                      : "Simulated analysis · No API key required"}
                  </div>
                </div>
              </section>
              <section className="research-grid">
                <div className="research-panel panel">
                  <div className="research-heading">
                    <div>
                      <h2>
                        <BrainCircuit size={19} />
                        Inside the trading desk{" "}
                        <Pill tone="neutral">5 agents</Pill>
                      </h2>
                      <p>Independent perspectives. A stronger conviction.</p>
                    </div>
                    <span className="consensus">
                      <span className="green-dot" />
                      {analysis?.id ? "Analysis complete" : "Sample debate"}
                    </span>
                  </div>
                  <div className="tabs">
                    {["Agent debate", "Final verdict", "Risk assessment"].map(
                      (t) => (
                        <button
                          key={t}
                          className={analysisTab === t ? "active" : ""}
                          onClick={() => setAnalysisTab(t)}
                        >
                          {t}
                          {t === "Agent debate" && <span>5</span>}
                        </button>
                      ),
                    )}
                    <span className="debate-model">
                      <Zap size={12} />
                      {analysis?.engine || "Demo simulation"}
                    </span>
                  </div>
                  {analysisTab === "Agent debate" ? (
                    <div className="agent-grid">
                      {analysis?.agents.map((agent) => {
                        const Icon = roleIcons[agent.id];
                        return (
                          <button
                            key={agent.id}
                            className={cls(
                              "agent-card",
                              expanded === agent.id && "expanded",
                            )}
                            onClick={() =>
                              setExpanded(
                                expanded === agent.id ? null : agent.id,
                              )
                            }
                          >
                            <div className="agent-card-top">
                              <span className={"agent-icon " + agent.id}>
                                <Icon size={17} />
                              </span>
                              <span className="agent-status">
                                <CheckCheck size={13} />
                              </span>
                            </div>
                            <h3>{agent.name}</h3>
                            <Pill
                              tone={
                                agent.stance === "Bullish"
                                  ? "green"
                                  : agent.stance === "Bearish"
                                    ? "red"
                                    : "neutral"
                              }
                            >
                              {agent.stance === "Bullish" ? (
                                <TrendingUp size={11} />
                              ) : agent.stance === "Bearish" ? (
                                <TrendingDown size={11} />
                              ) : (
                                <Activity size={11} />
                              )}{" "}
                              {agent.stance}
                            </Pill>
                            <p>{agent.summary}</p>
                            {expanded === agent.id && (
                              <ul>
                                {agent.points.map((point, i) => (
                                  <li key={i}>{point}</li>
                                ))}
                              </ul>
                            )}
                            <div className="agent-bottom">
                              <span>Conviction</span>
                              <strong>{agent.confidence}%</strong>
                            </div>
                            <div className="agent-track">
                              <i style={{ width: agent.confidence + "%" }} />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : analysisTab === "Final verdict" ? (
                    <div className="verdict-content">
                      <span className="agent-icon fundamental">
                        <Sparkles size={21} />
                      </span>
                      <div>
                        <h3>The judge’s conclusion</h3>
                        <p>{decision?.summary}</p>
                        <div className="verdict-columns">
                          <div>
                            <strong>Key catalyst</strong>
                            <p>{decision?.catalyst}</p>
                          </div>
                          <div>
                            <strong>What could change our mind</strong>
                            <p>{decision?.risk}</p>
                          </div>
                        </div>
                        <small>
                          Confidence reflects the desk’s conviction, not a
                          calibrated probability of profit.
                        </small>
                      </div>
                    </div>
                  ) : (
                    <div className="risk-content">
                      <div>
                        <ShieldCheck size={23} />
                        <h3>Risk is part of the decision.</h3>
                        <p>
                          Every order is checked independently by the server.
                        </p>
                      </div>
                      <div className="risk-rules">
                        <span>
                          Max position allocation<strong>10%</strong>
                        </span>
                        <span>
                          Risk budget per trade<strong>1%</strong>
                        </span>
                        <span>
                          Stock stop distance<strong>3.5%</strong>
                        </span>
                        <span>
                          Hard account loss cutoff<strong>5%</strong>
                        </span>
                      </div>
                      <p className="fine-print">
                        Prediction contracts are sized for total loss. Stops are
                        checked every minute while the server runs; fills use
                        the next observed quote and may exceed the stop.
                      </p>
                    </div>
                  )}
                  <div className="research-footer">
                    <ShieldCheck size={13} />
                    Every perspective is considered. The risk manager has the
                    final say.
                    <button onClick={() => setModal("workflow")}>
                      How it works <ArrowUpRight size={12} />
                    </button>
                  </div>
                </div>
                <div className="news-panel panel">
                  <div className="panel-title">
                    <h2>Market intelligence</h2>
                    <Radio size={16} className="muted" />
                  </div>
                  <div className="news-tabs">
                    <span>
                      <Newspaper size={14} />
                      Latest news
                    </span>
                    <Pill tone="neutral">
                      {context?.mode === "demo"
                        ? "Demo feed"
                        : "Connected feeds"}
                    </Pill>
                  </div>
                  {context?.news.slice(0, 3).map((n, i) => (
                    <button
                      className="news-item"
                      key={i}
                      onClick={() => setModal({ type: "news", item: n })}
                    >
                      <div className="news-byline">
                        <span>{n.source}</span>
                        <span>{n.time}</span>
                      </div>
                      <h3>{n.title}</h3>
                      <span
                        className={cls(
                          "news-sentiment",
                          n.sentiment === "Positive" ? "positive" : "muted",
                        )}
                      >
                        <i />
                        {n.sentiment}
                      </span>
                    </button>
                  ))}
                  {!context?.news.length && (
                    <p className="empty-small">
                      No news is available from this feed.
                    </p>
                  )}
                  <button
                    className="news-all"
                    onClick={() => setModal("sources")}
                  >
                    View all research sources <ArrowRight size={13} />
                  </button>
                </div>
              </section>
              <section className="prediction-strip">
                <span className="prediction-strip-icon">
                  <Globe2 size={19} />
                </span>
                <div>
                  <strong>The other side of the market</strong>
                  <p>
                    Real-world probabilities. More context for your next move.
                  </p>
                </div>
                {(context?.predictions || []).slice(0, 2).map((p) => (
                  <button
                    key={p.symbol}
                    onClick={() => {
                      if (
                        desk.assets.some((a) => a.symbol === p.symbol) ||
                        /^PM-\d+$/.test(p.symbol)
                      )
                        select(p.symbol);
                      else setModal({ type: "prediction", item: p });
                    }}
                  >
                    <span>{p.short}</span>
                    <strong>
                      {Math.round(p.price * 100)}
                      <small>%</small>
                    </strong>
                    <ChevronRight size={14} />
                  </button>
                ))}
                <button
                  className="prediction-explore"
                  onClick={() => {
                    setMarketTab("Predictions");
                    setPage("Markets");
                  }}
                >
                  Explore markets <ArrowUpRight size={14} />
                </button>
              </section>
            </>
          )}
          {page === "Portfolio" && (
            <section className="panel full-panel">
              <div className="panel-title">
                <h2>
                  Open positions{" "}
                  <Pill tone="neutral">{account?.positions.length || 0}</Pill>
                </h2>
                <Pill tone="green">Paper ledger</Pill>
              </div>
              {account?.positions.length ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Asset</th>
                        <th>Quantity</th>
                        <th>Entry</th>
                        <th>Last mark</th>
                        <th>Unrealized P&L</th>
                        <th>Stop / Target</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {account.positions.map((p) => (
                        <tr key={p.id}>
                          <td>
                            <strong>{p.symbol}</strong>
                            <small>{p.name}</small>
                          </td>
                          <td>{p.quantity}</td>
                          <td>{money(p.entry)}</td>
                          <td>{money(p.markPrice)}</td>
                          <td
                            className={
                              p.markPrice >= p.entry ? "positive" : "negative"
                            }
                          >
                            {money((p.markPrice - p.entry) * p.quantity)}
                          </td>
                          <td>
                            {money(p.stop)} / {money(p.target)}
                          </td>
                          <td>
                            <button
                              className="button secondary"
                              disabled={busy}
                              onClick={async () => {
                                setBusy(true);
                                try {
                                  await api(`/positions/${p.id}/close`, {});
                                  await refresh();
                                  notify("Paper position closed.");
                                } catch (e) {
                                  notify(e.message, true);
                                } finally {
                                  setBusy(false);
                                }
                              }}
                            >
                              Close position
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty
                  icon={Wallet}
                  title="Your next idea starts here"
                  text="Run an analysis, review the desk’s decision, and open your first paper position."
                  action="Explore the desk"
                  onClick={() => setPage("Overview")}
                />
              )}
            </section>
          )}
          {page === "Trade history" && (
            <>
              <section className="panel full-panel">
                <div className="panel-title">
                  <h2>Analysis history</h2>
                  <Pill tone="neutral">{desk?.history.length || 0} calls</Pill>
                </div>
                {desk?.history.length ? (
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Asset</th>
                          <th>Time</th>
                          <th>Decision</th>
                          <th>Confidence</th>
                          <th>Engine</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {desk.history.map((a) => (
                          <tr key={a.id}>
                            <td>
                              <strong>{a.symbol}</strong>
                            </td>
                            <td>{new Date(a.createdAt).toLocaleString()}</td>
                            <td>
                              <Pill
                                tone={
                                  a.decision.action === "BUY"
                                    ? "green"
                                    : "neutral"
                                }
                              >
                                {a.decision.action}
                              </Pill>
                            </td>
                            <td>{a.decision.confidence}%</td>
                            <td>{a.engine}</td>
                            <td>
                              <button
                                className="text-button"
                                onClick={() =>
                                  setModal({ type: "history", item: a })
                                }
                              >
                                View analysis <ArrowUpRight size={13} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty
                    icon={History}
                    title="A clear record of every call"
                    text="Your completed analyses will appear here, with the full debate and decision."
                    action="Run your first analysis"
                    onClick={() => setPage("Overview")}
                  />
                )}
              </section>
              <section className="panel full-panel">
                <div className="panel-title">
                  <h2>Closed paper trades</h2>
                </div>
                {account?.trades.length ? (
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Asset</th>
                          <th>Entry</th>
                          <th>Exit</th>
                          <th>Realized P&L</th>
                          <th>Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {account.trades.map((t) => (
                          <tr key={t.id}>
                            <td>{t.symbol}</td>
                            <td>{money(t.entry)}</td>
                            <td>{money(t.exit)}</td>
                            <td
                              className={t.pnl >= 0 ? "positive" : "negative"}
                            >
                              {money(t.pnl)}
                            </td>
                            <td>{t.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="empty-small">
                    Closed positions will appear here.
                  </p>
                )}
              </section>
            </>
          )}
          {page === "Markets" && (
            <section className="panel full-panel">
              <div className="panel-title">
                <h2>Market explorer</h2>
                <div className="segment">
                  <button
                    className={marketTab === "Stocks" ? "active" : ""}
                    onClick={() => setMarketTab("Stocks")}
                  >
                    Stocks
                  </button>
                  <button
                    className={marketTab === "Predictions" ? "active" : ""}
                    onClick={() => setMarketTab("Predictions")}
                  >
                    Predictions
                  </button>
                </div>
              </div>
              <label className="search-field explorer-search">
                <Search size={16} />
                <input
                  aria-label="Search all markets"
                  placeholder="Search by name or symbol"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <div className="explorer-grid">
                {filtered.map((a, i) => (
                  <button
                    className="explorer-card"
                    key={a.symbol}
                    onClick={() => select(a.symbol)}
                  >
                    <div>
                      <span
                        className="asset-logo"
                        style={{ color: a.color, background: a.color + "15" }}
                      >
                        {a.symbol[0]}
                      </span>
                      <Pill tone="neutral">{a.sector}</Pill>
                    </div>
                    <h3>{a.type === "stock" ? a.symbol : a.short}</h3>
                    <p>{a.name}</p>
                    <div>
                      <strong>
                        {a.type === "stock"
                          ? money(a.price)
                          : `${Math.round(a.price * 100)}%`}
                      </strong>
                      <Sparkline positive={a.change >= 0} seed={i} />
                    </div>
                    <span className={a.change >= 0 ? "positive" : "negative"}>
                      {a.change >= 0 ? "+" : ""}
                      {a.change.toFixed(2)}% <small>· Reference price</small>
                    </span>
                    <span className="explorer-link">
                      Open research desk <ArrowRight size={14} />
                    </span>
                  </button>
                ))}
              </div>
              {!filtered.length && (
                <p className="empty-small">
                  No matching assets. Try another search.
                </p>
              )}
              <p className="fine-print">
                Watchlist prices are illustrative references. Live mode fetches
                a current quote when you open an asset. Live contracts use the
                provider’s YES price.
              </p>
            </section>
          )}
          {page === "Settings" && (
            <div className="settings-grid">
              <section className="panel full-panel">
                <div className="panel-title">
                  <h2>Research connections</h2>
                  <Pill tone="neutral">Server configuration</Pill>
                </div>
                {[
                  [
                    "AI research team",
                    desk?.config.ai
                      ? "Connected · " + desk.config.model
                      : "Demo simulation",
                    "OPENAI_API_KEY",
                  ],
                  [
                    "Market data & earnings",
                    desk?.config.mode === "live"
                      ? "Finnhub live mode"
                      : "Synthetic demo data",
                    "FINNHUB_API_KEY",
                  ],
                  [
                    "Prediction market context",
                    "Public Polymarket feed in live mode",
                    "DATA_MODE=live",
                  ],
                  [
                    "Social sentiment",
                    "Optional custom JSON feed",
                    "SOCIAL_SENTIMENT_URL",
                  ],
                ].map(([name, status, key]) => (
                  <div className="connection-row" key={name}>
                    <span className="agent-icon fundamental">
                      <Layers size={19} />
                    </span>
                    <div>
                      <h3>{name}</h3>
                      <p>{status}</p>
                    </div>
                    <code>{key}</code>
                  </div>
                ))}
                <div className="setup-note">
                  <h3>Bring your own API key</h3>
                  <p>
                    Copy <code>.env.example</code> to <code>.env</code>, add
                    your provider key, and restart the server. Your keys stay on
                    the server.
                  </p>
                  <pre>
                    npm install{"\n"}cp .env.example .env{"\n"}npm run dev
                  </pre>
                </div>
              </section>
              <section className="panel full-panel safety-settings">
                <div className="panel-title">
                  <h2>Safety controls</h2>
                  <ShieldCheck size={20} />
                </div>
                <h3>
                  {account?.halted
                    ? "Trading is paused"
                    : "Your capital has guardrails"}
                </h3>
                <p>
                  Paper trading is enforced by design. There is no brokerage
                  integration or live execution path.
                </p>
                <div className="risk-rules">
                  <span>
                    Starting virtual capital<strong>$100,000</strong>
                  </span>
                  <span>
                    Hard loss cutoff<strong>5%</strong>
                  </span>
                  <span>
                    Maximum allocation<strong>10%</strong>
                  </span>
                  <span>
                    Minimum entry confidence<strong>65%</strong>
                  </span>
                </div>
                <button
                  className="button secondary"
                  onClick={async () => {
                    if (!account?.halted) {
                      setModal("cutoff");
                      return;
                    }
                    try {
                      await api("/resume", {});
                      await refresh();
                      notify("Paper trading resumed.");
                    } catch (e) {
                      notify(e.message, true);
                    }
                  }}
                >
                  {account?.halted
                    ? "Resume paper trading"
                    : "Activate emergency cutoff"}
                </button>
              </section>
            </div>
          )}
          <footer className="page-footer">
            <span>
              <span className="brand-mini">▥</span> Built for conviction,
              designed for control.
            </span>
            <span>
              <LockKeyhole size={11} /> Paper trading only{" "}
              <span className="mini-dot" />{" "}
              {desk?.config.mode === "live" ? "Provider data" : "Demo data"}{" "}
              <span className="mini-dot" /> Not financial advice
            </span>
          </footer>
        </main>
      </div>
      {toast && (
        <div className={cls("toast", toast.error && "error")} role="status">
          {toast.error ? <CircleHelp size={19} /> : <Check size={19} />}
          <span>{toast.text}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {modal && (
        <div className="modal-backdrop" onClick={() => !busy && setModal(null)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close icon-button"
              aria-label="Close dialog"
              disabled={busy}
              onClick={() => setModal(null)}
            >
              <X size={20} />
            </button>
            <ModalContent
              modal={modal}
              risk={risk}
              asset={asset}
              context={context}
              analysis={analysis}
              account={account}
              busy={busy}
              execute={execute}
              cutoff={cutoff}
              close={() => setModal(null)}
            />
          </section>
        </div>
      )}
    </div>
  );
}
function InfoDot() {
  return <CircleHelp size={11} className="muted" />;
}
function Stat({ label, value, icon: Icon, note, green }) {
  return (
    <div className="stat-card">
      <div className="stat-label">
        {label}
        <Icon size={16} />
      </div>
      <div className={cls("stat-value", green && "risk-good")}>
        {green && <span className="green-dot" />}
        {value}
      </div>
      <div className="stat-note">{note}</div>
    </div>
  );
}
function Empty({ icon: Icon, title, text, action, onClick }) {
  return (
    <div className="empty">
      <span>
        <Icon size={27} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
      <button className="button primary" onClick={onClick}>
        {action}
        <ArrowRight size={15} />
      </button>
    </div>
  );
}
function ModalContent({
  modal,
  risk,
  asset,
  context,
  analysis,
  account,
  busy,
  execute,
  cutoff,
  close,
}) {
  if (modal === "trade")
    return (
      <>
        <span className="modal-symbol">
          <ArrowUpRight size={25} />
        </span>
        <h2 id="modal-title">Your paper trade plan</h2>
        <p>
          Risk manager’s plan for {asset?.symbol}. Prices are refreshed before
          execution.
        </p>
        <div className="trade-details">
          {[
            [
              "Position",
              `${risk.quantity} ${asset?.type === "prediction" ? "YES contracts" : "shares"}`,
            ],
            ["Estimated entry", money(risk.entry)],
            ["Stop loss", money(risk.stop)],
            ["Take profit", money(risk.target)],
            ["Position value", money(risk.notional)],
            [
              "Budgeted risk",
              `${money(risk.maxLoss)} · ${risk.riskPercent.toFixed(2)}%`,
            ],
          ].map(([k, v]) => (
            <div key={k}>
              <span>{k}</span>
              <strong>{v}</strong>
            </div>
          ))}
        </div>
        {!risk.allowed && <p className="error-box">{risk.reason}</p>}
        <p className="fine-print">
          Stops can slip or gap. Orders are recorded only in your local paper
          ledger. No real money is used.
        </p>
        <button
          className="button primary wide"
          disabled={!risk.allowed || busy}
          onClick={execute}
        >
          {busy ? (
            <LoaderCircle className="spin" size={17} />
          ) : (
            <ShieldCheck size={17} />
          )}
          Confirm paper trade
        </button>
      </>
    );
  if (modal === "cutoff")
    return (
      <>
        <span className="modal-symbol red">
          <ShieldOff size={25} />
        </span>
        <h2 id="modal-title">Pause the trading desk?</h2>
        <p>
          This closes all {account?.positions.length || 0} open paper positions
          at their last observed marks and blocks new orders. You can resume
          from Settings if the account is within its loss limit.
        </p>
        <button className="button danger wide" onClick={cutoff}>
          Activate emergency cutoff
        </button>
        <button className="text-button wide" onClick={close}>
          Keep researching
        </button>
      </>
    );
  if (modal === "help" || modal === "workflow")
    return (
      <>
        <span className="modal-symbol">
          <BrainCircuit size={27} />
        </span>
        <h2 id="modal-title">A team behind every trade</h2>
        <p>One research flow, with checks at every step.</p>
        <ol className="workflow">
          <li>
            <strong>Gather evidence</strong>
            <p>
              Prices, news, earnings, social sentiment, and prediction market
              probabilities.
            </p>
          </li>
          <li>
            <strong>Debate the thesis</strong>
            <p>
              Market and fundamental analysts establish context. A bull argues
              the opportunity, a bear challenges it, and a neutral researcher
              weighs both sides.
            </p>
          </li>
          <li>
            <strong>Make the call</strong>
            <p>
              A final judge reads the debate and returns a decision,
              explanation, and subjective confidence.
            </p>
          </li>
          <li>
            <strong>Check the risk</strong>
            <p>
              The server sizes the position and enforces stops, allocation
              limits, and the hard 5% loss cutoff.
            </p>
          </li>
        </ol>
        <p className="fine-print">
          Without an API key, the debate uses labeled illustrative scenarios.
          See README.md for local setup, providers, and operational limits.
        </p>
      </>
    );
  if (modal === "notifications")
    return (
      <>
        <h2 id="modal-title">Desk activity</h2>
        <div className="notification-item">
          <ShieldCheck size={20} />
          <div>
            <strong>Paper mode is active</strong>
            <p>All execution stays in your local virtual ledger.</p>
          </div>
        </div>
        <div className="notification-item">
          <BrainCircuit size={20} />
          <div>
            <strong>
              {analysis?.id ? "Latest analysis saved" : "Your desk is ready"}
            </strong>
            <p>
              {analysis?.id
                ? `${analysis.symbol} · ${analysis.decision.action} · ${analysis.decision.confidence}% confidence`
                : "Select an asset and run your first analysis."}
            </p>
          </div>
        </div>
      </>
    );
  if (modal === "sources")
    return (
      <>
        <h2 id="modal-title">Research sources</h2>
        <p>Data provenance for the current asset.</p>
        {context?.sources.map((s) => (
          <div key={s.name} className="source-row">
            <span>{s.name}</span>
            <Pill tone={s.status === "demo" ? "purple" : "green"}>
              {s.status}
            </Pill>
          </div>
        ))}
        {context?.warnings.map((w) => (
          <p key={w} className="error-box">
            {w}
          </p>
        ))}
        <p className="fine-print">
          As of {new Date(context?.asOf).toLocaleString()}. Demo inputs are
          synthetic and do not represent current conditions.
        </p>
      </>
    );
  if (modal.type === "news")
    return (
      <>
        <Pill tone="neutral">{modal.item.source}</Pill>
        <h2 id="modal-title">{modal.item.title}</h2>
        <p>
          {modal.item.url
            ? "This headline was retrieved from the connected news provider. Open the source for the full report."
            : "This is an illustrative headline used to demonstrate the desk’s research workflow. Connect a news provider to see current reporting."}
        </p>
        {/^https?:\/\//.test(modal.item.url || "") && (
          <a
            className="button primary"
            href={modal.item.url}
            target="_blank"
            rel="noreferrer"
          >
            Read original report <ArrowUpRight size={15} />
          </a>
        )}
      </>
    );
  if (modal.type === "prediction")
    return (
      <>
        <Pill>Polymarket context</Pill>
        <h2 id="modal-title">{modal.item.name}</h2>
        <div className="stat-value">{Math.round(modal.item.price * 100)}%</div>
        <p>
          Implied YES probability from the connected market. This is a market
          price, not an independent forecast. Select this contract from the
          market explorer to analyze it.
        </p>
      </>
    );
  if (modal.type === "history") {
    const a = modal.item;
    return (
      <>
        <Pill>{a.engine}</Pill>
        <h2 id="modal-title">
          {a.symbol} · {a.decision.action}
        </h2>
        <p>
          {new Date(a.createdAt).toLocaleString()} · {a.decision.confidence}%
          confidence
        </p>
        <p>{a.decision.summary}</p>
        {a.agents.map((agent) => (
          <div className="history-agent" key={agent.id}>
            <strong>{agent.name}</strong>
            <Pill
              tone={
                agent.stance === "Bullish"
                  ? "green"
                  : agent.stance === "Bearish"
                    ? "red"
                    : "neutral"
              }
            >
              {agent.stance}
            </Pill>
            <p>{agent.summary}</p>
          </div>
        ))}
      </>
    );
  }
  return null;
}
createRoot(document.getElementById("root")).render(<App />);
