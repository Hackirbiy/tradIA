import { Router } from "express";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { completion } from "./agents.js";
import { startTelegram } from "./telegram.js";

export const specialists = [
  {
    id: "D1",
    name: "Stratège macro",
    subtitle: "Le cap du marché",
    focus: "BOS / CHoCH · EMA 50 / 200 · liquidité weekly / daily · calendrier",
    vote: "BUY",
    confidence: 88,
    summary:
      "Scénario : tendance haussière, prix au-dessus des EMA 50 et 200. Liquidité acheteuse au-dessus du plus haut journalier.",
    tags: ["EMA 50 > 200", "Biais haussier"],
  },
  {
    id: "H1",
    name: "Institutionnel",
    subtitle: "Les zones de décision",
    focus: "Order blocks · fair value gaps · VWAP de session · ATR",
    vote: "BUY",
    confidence: 84,
    summary:
      "Scénario : réaction sur un order block haussier. Le prix évolue au-dessus de la VWAP de session.",
    tags: ["Order block", "FVG haussier"],
  },
  {
    id: "M15",
    name: "Chasseur de liquidité",
    subtitle: "Le contexte intraday",
    focus: "Sweeps · BOS / CHoCH M15 · profil de session",
    vote: "BUY",
    confidence: 81,
    summary:
      "Scénario : balayage du plus bas asiatique suivi d’un BOS haussier. Reprise de la zone de valeur.",
    tags: ["Sweep confirmé", "BOS haussier"],
  },
  {
    id: "M5",
    name: "Timing & momentum",
    subtitle: "Le point d’entrée",
    focus: "Stochastique · momentum · EMA 9 / 21 · stop dynamique ATR",
    vote: "BUY",
    confidence: 86,
    summary:
      "Scénario : croisement des EMA 9 et 21. Stop à 1,5 × ATR M5 ; attendre un retest pour limiter la distance d’entrée.",
    tags: ["Momentum +", "ATR × 1,5"],
  },
  {
    id: "M1",
    name: "Microstructure",
    subtitle: "La précision d’exécution",
    focus: "Tick volume · pics de volume · micro-cassures · spread",
    vote: "HOLD",
    confidence: 65,
    summary:
      "Scénario : volume encore insuffisant sur la micro-cassure. Attendre une confirmation avant l’exécution.",
    tags: ["Volume faible", "En observation"],
  },
  {
    id: "COR",
    name: "Inter-marchés",
    subtitle: "La confirmation externe",
    focus: "Dollar index DXY · taux US 10 ans · corrélations avec l’or",
    vote: "SELL",
    confidence: 62,
    summary:
      "Scénario : reprise du dollar et des rendements US. Cette divergence réduit la confluence du signal acheteur.",
    tags: ["DXY en reprise", "Divergence"],
  },
];
export function candles(tf = "M15") {
  const step = { M1: 1, M5: 5, M15: 15, H1: 60, D1: 1440 }[tf];
  const end = Date.UTC(2026, 9, 12, 15, 30);
  let last = 2631.8;
  return Array.from({ length: 64 }, (_, i) => {
    const open = last;
    const close =
      open + 0.34 + Math.sin(i * 1.8 + step) * 2 + Math.cos(i * 0.6) * 1.1;
    last = close;
    return {
      time: end - (63 - i) * step * 60000,
      open,
      close,
      high: Math.max(open, close) + 0.7 + Math.abs(Math.sin(i)) * 1.3,
      low: Math.min(open, close) - 0.7 - Math.abs(Math.cos(i)) * 1.1,
      volume: Math.round(100 + Math.abs(Math.sin(i * 0.7)) * 300),
    };
  });
}
export function judge(agents, settings, halted = false) {
  const buy = agents.filter((a) => a.vote === "BUY").length;
  const sell = agents.filter((a) => a.vote === "SELL").length;
  const score = Math.round((Math.max(buy, sell) / 6) * 100);
  const direction = buy > sell ? "BUY" : sell > buy ? "SELL" : "HOLD";
  const action =
    halted || score < Math.max(75, settings.threshold) ? "HOLD" : direction;
  const entry = candles().at(-1).close;
  const distance = 4.8; // illustrative ATR M5 3.2 × 1.5
  const sign = direction === "SELL" ? -1 : 1;
  return {
    action,
    direction,
    score,
    buy,
    sell,
    hold: 6 - buy - sell,
    entry,
    stop: entry - sign * distance,
    target: entry + sign * distance * settings.rr,
    rr: settings.rr,
    reason: halted
      ? "Coupe-circuit déclenché : toute entrée est suspendue."
      : score < Math.max(75, settings.threshold)
        ? "Confluence insuffisante : attendre un consensus plus fort."
        : `${Math.max(buy, sell)} votes sur 6 convergent. Chaque agent dispose du même poids.`,
  };
}
// Called synchronously after all six votes, before the single ledger save.
export function executeJudge(state, analysis) {
  const blocked = (reason) => ({ status: "blocked", reason });
  if (
    !analysis ||
    !Number.isFinite(Date.parse(analysis.createdAt)) ||
    Date.now() - Date.parse(analysis.createdAt) > 5 * 60000
  )
    return blocked("Analyse absente ou expirée.");
  const decision = judge(analysis.agents, state.settings, state.halted);
  if (decision.action === "HOLD") return blocked(decision.reason);
  if (state.orders.some((o) => o.analysisId === analysis.id))
    return blocked("Cette analyse a déjà été exécutée.");
  if (state.orders.some((o) => o.status === "open"))
    return blocked("Une position est déjà ouverte.");
  const riskAmount = (state.balance * state.settings.risk) / 100;
  const lots =
    Math.floor(
      (riskAmount / (Math.abs(decision.entry - decision.stop) * 100)) * 100,
    ) / 100;
  if (!Number.isFinite(lots) || lots < 0.01)
    return blocked("Budget de risque inférieur au lot minimum.");
  const order = {
    ...decision,
    id: randomUUID(),
    analysisId: analysis.id,
    lots,
    riskAmount: lots * 100 * Math.abs(decision.entry - decision.stop),
    createdAt: new Date().toISOString(),
    status: "open",
    mode: "demo",
    execution: "automatic",
  };
  state.orders.unshift(order);
  return {
    status: "executed",
    orderId: order.id,
    reason: "Le juge a exécuté automatiquement l’ordre simulé.",
  };
}
const configSchema = z
  .object({
    risk: z.number().min(0.1).max(2),
    threshold: z.number().int().min(75).max(100),
    rr: z.number().min(1).max(5),
  })
  .strict();
const voteSchema = z.object({
  vote: z.enum(["BUY", "SELL", "HOLD"]),
  confidence: z.number().min(0).max(100),
  summary: z.string().min(1).max(1500),
});
const voteJSON = {
  type: "object",
  properties: {
    vote: { type: "string", enum: ["BUY", "SELL", "HOLD"] },
    confidence: { type: "number" },
    summary: { type: "string" },
  },
  required: ["vote", "confidence", "summary"],
  additionalProperties: false,
};
export function xauRouter(directory, { mt4Snapshot, mt4Halt } = {}) {
  const router = Router();
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, "xau.json");
  const state = fs.existsSync(file)
    ? JSON.parse(fs.readFileSync(file, "utf8"))
    : {
        settings: { risk: 0.5, threshold: 75, rr: 2.5 },
        halted: false,
        analyses: [],
        orders: [],
        balance: 10000,
      };
  state.settings = configSchema.parse({
    ...state.settings,
    threshold: Math.max(75, state.settings.threshold),
  });
  const save = () => {
    fs.writeFileSync(file + ".tmp", JSON.stringify(state), { mode: 0o600 });
    fs.renameSync(file + ".tmp", file);
  };
  const snapshot = () => ({
    ...state,
    agents: state.analyses[0]?.agents || specialists,
    decision: judge(
      state.analyses[0]?.agents || specialists,
      state.settings,
      state.halted,
    ),
    mode: "demo",
    ai: Boolean(process.env.OPENAI_API_KEY),
    mt4: false,
    telegram: { ...telegram },
  });
  const telegram = startTelegram(() => {
    const live = mt4Snapshot?.();
    return live?.identity ? live : snapshot();
  }, mt4Halt);
  router.get("/", (_, res) => res.json(snapshot()));
  router.get("/candles", (req, res) => {
    const tf = z
      .enum(["M1", "M5", "M15", "H1", "D1"])
      .parse(req.query.tf || "M15");
    res.json(candles(tf));
  });
  let busy = false;
  router.post("/analyze", async (_, res) => {
    if (busy)
      return res.status(409).json({ error: "Une analyse est déjà en cours." });
    busy = true;
    try {
      let agents = specialists;
      if (process.env.OPENAI_API_KEY) {
        agents = await Promise.all(
          specialists.map(async (a) => ({
            ...a,
            tags: ["Analyse IA", "Données simulées"],
            ...voteSchema.parse(
              await completion(
                `Tu es ${a.name}, spécialiste XAUUSD. Ton périmètre : ${a.focus}. Réponds en français. Les données sont synthétiques. Les indicateurs avancés, calendrier, DXY et taux ne sont pas fournis : ne les invente pas, utilise HOLD si tes données manquent.`,
                {
                  candles: candles(["COR"].includes(a.id) ? "D1" : a.id),
                  mode: "synthetic",
                  timeframe: a.id,
                },
                voteJSON,
                "xau_vote",
              ),
            ),
          })),
        );
      }
      state.analyses.unshift({
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        agents,
        decision: judge(agents, state.settings, state.halted),
        engine: process.env.OPENAI_API_KEY
          ? "OpenAI · données simulées"
          : "Scénario de démonstration",
      });
      state.analyses[0].execution = executeJudge(state, state.analyses[0]);
      state.analyses = state.analyses.slice(0, 100);
      save();
      res.json(snapshot());
    } finally {
      busy = false;
    }
  });
  router.post("/settings", (req, res) => {
    state.settings = configSchema.parse(req.body);
    save();
    res.json(snapshot());
  });
  router.post("/halt", (_, res) => {
    state.halted = true;
    save();
    res.json(snapshot());
  });
  router.post("/resume", (_, res) => {
    state.halted = false;
    save();
    res.json(snapshot());
  });
  router.post("/close", (req, res) => {
    const order = state.orders.find(
      (o) => o.id === req.body.id && o.status === "open",
    );
    if (!order) throw Error("Position introuvable.");
    order.status = "closed";
    order.closedAt = new Date().toISOString();
    order.pnl = 0;
    save();
    res.json(snapshot());
  });
  return router;
}
