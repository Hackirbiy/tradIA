import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { assets, marketContext, predictionMarkets } from "./data.js";
import { analyze, demoAnalysis } from "./agents.js";
import { createStore } from "./store.js";
import { riskPlan, equity, applyMarks, closePosition, LIMITS } from "./risk.js";
import { createMt4 } from "./mt4.js";
import { xauRouter } from "./xau.js";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const store = createStore(process.env.DATA_DIR || path.join(root, ".data"));
const app = express();
app.disable("x-powered-by");
const mt4 = createMt4(process.env.DATA_DIR || path.join(root, ".data"));
app.use("/api/mt4", mt4.router);
app.get("/bridge-files/AurumBridge.mq4", (_, res) =>
  res.download(path.join(root, "mt4/AurumBridge.mq4")),
);
app.get("/bridge-files/mt4-relay.mjs", (_, res) =>
  res.download(path.join(root, "scripts/mt4-relay.mjs")),
);
app.get("/bridge-files/README.md", (_, res) =>
  res.download(path.join(root, "mt4/README.md")),
);
app.use(express.json({ limit: "16kb" }));
app.use("/api", (req, res, next) => {
  if (
    req.method !== "GET" &&
    req.headers.origin &&
    new URL(req.headers.origin).host !== req.headers.host
  )
    return res
      .status(403)
      .json({ error: "Cross-origin writes are not allowed" });
  res.set("Cache-Control", "no-store");
  next();
});
app.use(
  "/api/xau",
  xauRouter(process.env.DATA_DIR || path.join(root, ".data"), {
    mt4Snapshot: mt4.snapshot,
    mt4Halt: mt4.halt,
  }),
);
const account = () => ({
  ...store.get(),
  analyses: undefined,
  equity: equity(store.get()),
  limits: LIMITS,
});
const markContext = (context) => {
  if (
    context.mode === "demo" ||
    Date.now() - Date.parse(context.asOf) <= 15 * 60000
  )
    applyMarks(store.get(), { [context.asset.symbol]: context.asset.price });
};
const lookup = (symbol) => {
  if (
    !assets.some((a) => a.symbol === symbol) &&
    !(process.env.DATA_MODE === "live" && /^PM-\d+$/.test(symbol))
  )
    throw Error("Unknown asset");
  return symbol;
};
app.get("/api/health", (_, res) => res.json({ ok: true, execution: "paper" }));
app.get("/api/desk", async (_, res) =>
  res.json({
    assets:
      process.env.DATA_MODE === "live"
        ? [
            ...assets.filter((a) => a.type === "stock"),
            ...(await predictionMarkets().catch(() => [])),
          ]
        : assets,
    account: account(),
    history: store
      .get()
      .analyses.map(({ context, ...a }) => ({ ...a, asset: context.asset })),
    config: {
      mode: process.env.DATA_MODE === "live" ? "live" : "demo",
      ai: !!process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_API_KEY
        ? process.env.OPENAI_MODEL || "gpt-4.1-mini"
        : null,
    },
  }),
);
app.get("/api/market/:symbol", async (req, res) => {
  const context = await marketContext(lookup(req.params.symbol));
  markContext(context);
  store.save();
  const previous = store
    .get()
    .analyses.find((a) => a.symbol === context.asset.symbol);
  res.json({
    context,
    analysis: previous || {
      id: null,
      ...demoAnalysis(context),
      createdAt: context.asOf,
      symbol: context.asset.symbol,
    },
    account: account(),
  });
});
let analyzing = false;
app.post("/api/analyze", async (req, res) => {
  if (analyzing)
    return res.status(429).json({
      error: "An analysis is already running. Please wait for it to finish.",
    });
  analyzing = true;
  try {
    const context = await marketContext(lookup(req.body.symbol));
    const result = await analyze(context);
    markContext(context);
    const analysis = {
      id: randomUUID(),
      symbol: context.asset.symbol,
      createdAt: new Date().toISOString(),
      context,
      ...result,
    };
    store.get().analyses.unshift(analysis);
    store.get().analyses = store.get().analyses.slice(0, 200);
    store.save();
    res.json({
      analysis,
      risk: riskPlan(store.get(), context, result.decision),
      account: account(),
    });
  } finally {
    analyzing = false;
  }
});
app.get("/api/risk/:id", (req, res) => {
  const analysis = store.get().analyses.find((a) => a.id === req.params.id);
  if (!analysis)
    return res
      .status(404)
      .json({ error: "Analysis not found. Run an analysis first." });
  res.json(riskPlan(store.get(), analysis.context, analysis.decision));
});
app.post("/api/orders", async (req, res) => {
  const analysis = store
    .get()
    .analyses.find((a) => a.id === req.body.analysisId);
  if (!analysis) throw Error("Run an analysis before creating a paper order");
  if (Date.now() - Date.parse(analysis.createdAt) > 15 * 60000)
    throw Error("Analysis expired. Run a fresh analysis before trading.");
  const fresh = await marketContext(analysis.symbol);
  if (fresh.mode === "live" && Date.now() - Date.parse(fresh.asOf) > 15 * 60000)
    throw Error(
      "Quote is older than 15 minutes. Paper execution requires a fresh quote.",
    );
  // No await after reading the current ledger: duplicate concurrent requests cannot double-fill.
  const state = store.get();
  if (
    state.positions.some((p) => p.analysisId === analysis.id) ||
    state.trades.some((p) => p.analysisId === analysis.id)
  )
    throw Error("This analysis has already been traded");
  applyMarks(state, { [analysis.symbol]: fresh.asset.price });
  const risk = riskPlan(state, fresh, analysis.decision);
  if (!risk.allowed) {
    store.save();
    return res.status(409).json({ error: risk.reason });
  }
  const position = {
    id: randomUUID(),
    analysisId: analysis.id,
    symbol: analysis.symbol,
    name: fresh.asset.short,
    type: fresh.asset.type,
    quantity: risk.quantity,
    entry: risk.entry,
    markPrice: risk.entry,
    stop: risk.stop,
    target: risk.target,
    openedAt: new Date().toISOString(),
  };
  state.cash -= risk.notional;
  state.positions.push(position);
  store.save();
  res.status(201).json({ position, account: account() });
});
app.post("/api/positions/:id/close", async (req, res) => {
  const position = store.get().positions.find((p) => p.id === req.params.id);
  if (!position) throw Error("Position not found");
  const context = await marketContext(position.symbol);
  if (
    context.mode === "live" &&
    Date.now() - Date.parse(context.asOf) > 15 * 60000
  )
    throw Error(
      "Quote is too old to close this position. Try again when fresh data is available.",
    );
  closePosition(store.get(), position.id, context.asset.price);
  applyMarks(store.get(), {});
  store.save();
  res.json(account());
});
app.post("/api/cutoff", (req, res) => {
  store.get().halted = true;
  for (const p of [...store.get().positions])
    closePosition(
      store.get(),
      p.id,
      p.markPrice,
      "Emergency cutoff at last observed mark",
    );
  store.save();
  res.json(account());
});
app.post("/api/resume", (req, res) => {
  if (equity(store.get()) <= LIMITS.initialCapital * (1 - LIMITS.maxLoss))
    return res.status(409).json({
      error: "Account loss limit reached. This ledger cannot resume trading.",
    });
  store.get().halted = false;
  store.save();
  res.json(account());
});
app.use("/api", (err, req, res, next) => {
  console.error("Request failed:", err.message);
  res.status(400).json({ error: err.message || "Request failed" });
});
app.use("/api", (_, res) =>
  res.status(404).json({ error: "Unknown API route" }),
);
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(root, "dist")));
  app.get("/{*path}", (_, res) =>
    res.sendFile(path.join(root, "dist/index.html")),
  );
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    root,
    server: { middlewareMode: true, allowedHosts: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
// Mark positions while the local server is running. Outages never create substitute quotes.
let marking = false;
const timer = setInterval(async () => {
  if (marking) return;
  marking = true;
  try {
    const symbols = [...new Set(store.get().positions.map((p) => p.symbol))];
    const results = await Promise.allSettled(symbols.map(marketContext));
    const prices = {};
    for (const r of results)
      if (
        r.status === "fulfilled" &&
        (r.value.mode === "demo" ||
          Date.now() - Date.parse(r.value.asOf) < 15 * 60000)
      )
        prices[r.value.asset.symbol] = r.value.asset.price;
    applyMarks(store.get(), prices);
    store.save();
  } catch (error) {
    console.error("Mark update failed:", error.message);
  } finally {
    marking = false;
  }
}, 60000);
timer.unref();
app.listen(Number(process.env.PORT) || 3000, "0.0.0.0", () =>
  console.log(
    `tradIA paper desk ready on port ${Number(process.env.PORT) || 3000}`,
  ),
);
