import fs from "node:fs";
import path from "node:path";
import { timingSafeEqual } from "node:crypto";
import { Router, json } from "express";
import { z } from "zod";
import { buildEvidence, atr, TF } from "./xau-strategy.js";
import { completion } from "./agents.js";
const finite = z.number().finite();
const positive = finite.positive();
const candle = z
  .object({
    time: positive,
    open: positive,
    high: positive,
    low: positive,
    close: positive,
    volume: finite.nonnegative(),
  })
  .refine(
    (b) =>
      b.high >= Math.max(b.open, b.close, b.low) &&
      b.low <= Math.min(b.open, b.close),
    "OHLC invalides",
  );
const series = z
  .array(candle)
  .max(500)
  .refine(
    (b) => b.every((c, i) => !i || c.time > b[i - 1].time),
    "Bougies hors ordre",
  );
export const feedSchema = z.object({
  source: z.literal("aurum-mt4-v1"),
  capturedAt: positive,
  connected: z.boolean(),
  tradeAllowed: z.boolean(),
  account: z.object({
    login: z.number().int().positive(),
    server: z.string().min(1).max(150),
    demo: z.boolean(),
    currency: z.string().max(10),
    balance: positive,
    equity: finite,
  }),
  symbol: z.string().min(1).max(40),
  quote: z
    .object({
      bid: positive,
      ask: positive,
      point: positive,
      digits: z.number().int().min(0).max(8),
      tickTime: positive,
      tickValue: positive,
      tickSize: positive,
      minLot: positive,
      maxLot: positive,
      lotStep: positive,
      stopPoints: finite.nonnegative(),
    })
    .refine((q) => q.ask >= q.bid && q.maxLot >= q.minLot),
  bars: z.object(
    Object.fromEntries(
      [...TF, "W1", "DXY", "US10Y"].map((tf) => [tf, series.optional()]),
    ),
  ),
  calendar: z
    .object({
      asOf: positive,
      blocked: z.boolean(),
      event: z.string().max(300).optional(),
    })
    .nullable(),
  positions: z
    .array(
      z.object({
        ticket: z.number().int().positive(),
        symbol: z.string(),
        type: z.string(),
        lots: positive,
        entry: positive,
        sl: finite,
        tp: finite,
        pnl: finite,
      }),
    )
    .max(1000),
  lastCommand: z.object({
    id: z.number().int().nonnegative(),
    result: z.enum(["none", "executed", "rejected", "unknown"]),
    ticket: z.number().int().nonnegative(),
    reason: z.string().max(500),
  }),
});
const configSchema = z
  .object({
    threshold: finite.min(75).max(100),
    risk: finite.min(0.1).max(2),
    rr: finite.min(1).max(5),
    maxDailyLoss: finite.min(0.1).max(5),
    maxSpreadPoints: finite.min(1).max(100),
  })
  .strict();
export function confluence(agents, threshold = 75) {
  const buy = agents.filter((a) => a.vote === "BUY").length,
    sell = agents.filter((a) => a.vote === "SELL").length;
  const score = (Math.max(buy, sell) / 6) * 100;
  return {
    buy,
    sell,
    hold: 6 - buy - sell,
    score,
    action:
      agents.length === 6 && score >= Math.max(75, threshold) && buy !== sell
        ? buy > sell
          ? "BUY"
          : "SELL"
        : "HOLD",
  };
}
export function livePlan(feed, config, direction, now = Date.now()) {
  const q = feed.quote;
  if (feed.account.equity <= 0) throw Error("Equity insuffisante.");
  if (!feed.connected || !feed.tradeAllowed)
    throw Error("Terminal déconnecté ou AutoTrading désactivé.");
  if (
    now / 1000 - feed.capturedAt > 10 ||
    now / 1000 - q.tickTime > 10 ||
    feed.capturedAt > now / 1000 + 5 ||
    q.tickTime > now / 1000 + 5
  )
    throw Error("Cotations périmées ou horloge incorrecte.");
  if (
    !feed.calendar ||
    feed.calendar.asOf > now / 1000 + 30 ||
    now / 1000 - feed.calendar.asOf > 300 ||
    feed.calendar.blocked
  )
    throw Error("Calendrier absent, périmé ou annonce bloquante.");
  if (feed.positions.some((p) => p.symbol === feed.symbol))
    throw Error("Une position ou un ordre est déjà présent sur ce symbole.");
  const m5 = feed.bars.M5;
  if (
    !m5?.length ||
    now / 1000 - (m5.at(-1).time + 300) > 600 ||
    m5.at(-1).time + 300 > now / 1000 + 5
  )
    throw Error("Historique M5 périmé ou bougie non clôturée.");
  const a = atr(m5);
  if (!a || a <= 0) throw Error("ATR M5 indisponible.");
  const spread = q.ask - q.bid;
  const distance = Math.max(a * 1.5, (q.stopPoints + 1) * q.point + spread);
  if (spread / q.point > config.maxSpreadPoints || spread > distance * 0.35)
    throw Error("Spread supérieur à la limite.");
  const entry = direction === "BUY" ? q.ask : q.bid,
    sign = direction === "BUY" ? 1 : -1;
  const stop = Number((entry - sign * distance).toFixed(q.digits)),
    target = Number((entry + sign * distance * config.rr).toFixed(q.digits));
  const lossPerLot = (Math.abs(entry - stop) / q.tickSize) * q.tickValue;
  const budget = (feed.account.balance * config.risk) / 100;
  const lots =
    Math.floor(Math.min(q.maxLot, budget / lossPerLot) / q.lotStep + 1e-9) *
    q.lotStep;
  if (
    lots < q.minLot ||
    !Number.isFinite(lots) ||
    lots * lossPerLot > budget + 1e-6
  )
    throw Error("Lot minimum incompatible avec le budget de risque.");
  return {
    action: direction,
    entry,
    stop,
    target,
    lots: Number(lots.toFixed(8)),
    riskAmount: lots * lossPerLot,
    rr: Math.abs(target - entry) / Math.abs(entry - stop),
    atrM5: a,
  };
}
export async function assess(feed) {
  const evidence = buildEvidence(feed);
  if (!process.env.OPENAI_API_KEY)
    return { agents: evidence, engine: "Règles techniques · MT4" };
  const schema = {
    type: "object",
    properties: {
      vote: { type: "string", enum: ["BUY", "SELL", "HOLD"] },
      confidence: { type: "number" },
      summary: { type: "string" },
    },
    required: ["vote", "confidence", "summary"],
    additionalProperties: false,
  };
  const parsed = z.object({
    vote: z.enum(["BUY", "SELL", "HOLD"]),
    confidence: finite.min(0).max(100),
    summary: z.string().min(1).max(1500),
  });
  const agents = await Promise.all(
    evidence.map(async (e) => {
      const model = parsed.parse(
        await completion(
          `Spécialiste XAUUSD ${e.id}. Analyse ces indicateurs et contraintes, en français. Ton vote doit être HOLD ou le vote proposé par les conditions techniques. Données manquantes = HOLD. La conviction ne pondère pas ton vote.`,
          e,
          schema,
          "specialist",
        ),
      );
      return {
        ...e,
        ...model,
        vote: e.missing.length || model.vote !== e.vote ? "HOLD" : model.vote,
      };
    }),
  );
  return { agents, engine: "6 appels IA · données MT4" };
}
export function createMt4(directory, options = {}) {
  const token = options.token ?? process.env.MT4_BRIDGE_TOKEN;
  const analyze = options.analyze ?? assess;
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, "mt4.json");
  const state = fs.existsSync(file)
    ? JSON.parse(fs.readFileSync(file, "utf8"))
    : {
        identity: null,
        config: {
          threshold: 75,
          risk: 0.5,
          rr: 2.5,
          maxDailyLoss: 3,
          maxSpreadPoints: 100,
        },
        halted: false,
        day: null,
        startEquity: null,
        commands: [],
        analysis: null,
        lastId: 0,
        lastFired: null,
      };
  state.config = configSchema.parse({
    ...state.config,
    threshold: Math.max(75, state.config.threshold),
  });
  // Restart always requires explicit rearming; no latent automatic restart.
  let armed = false,
    feed = null,
    receivedAt = 0,
    busy = false,
    lastEvaluated = null,
    error = null;
  const save = () => {
    fs.writeFileSync(file + ".tmp", JSON.stringify(state), { mode: 0o600 });
    fs.renameSync(file + ".tmp", file);
  };
  const fresh = () =>
    Boolean(
      feed &&
      Date.now() - receivedAt < 10000 &&
      Date.now() / 1000 - feed.capturedAt < 10 &&
      Date.now() / 1000 - feed.quote.tickTime < 10,
    );
  const snapshot = () => ({
    configured: Boolean(token),
    connected: fresh() && feed.connected,
    armed,
    halted: state.halted,
    busy,
    error,
    identity: state.identity,
    config: state.config,
    feed,
    analysis: state.analysis,
    commands: state.commands.slice(0, 30),
    receivedAt,
    engine: process.env.OPENAI_API_KEY ? "6 IA" : "Règles techniques",
    dailyLoss:
      feed && state.startEquity
        ? Math.max(
            0,
            ((state.startEquity - feed.account.equity) / state.startEquity) *
              100,
          )
        : 0,
  });
  const checkDay = () => {
    const day = new Date().toISOString().slice(0, 10);
    if (state.day !== day) {
      state.day = day;
      state.startEquity = feed.account.equity;
    }
    if (
      state.startEquity > 0 &&
      feed.account.equity <=
        state.startEquity * (1 - state.config.maxDailyLoss / 100)
    ) {
      state.halted = true;
      armed = false;
      error = "Circuit breaker : limite de perte journalière atteinte.";
    }
  };
  const evaluate = async () => {
    if (busy || !fresh() || !state.identity) return;
    const candleTime = feed.bars.M1?.at(-1)?.time;
    if (!candleTime || candleTime === lastEvaluated) return;
    // Timeframes are UTC closed bars; missing/old input must not manufacture votes.
    const durations = {
      D1: 86400,
      H1: 3600,
      M15: 900,
      M5: 300,
      M1: 60,
      W1: 604800,
      DXY: 3600,
      US10Y: 3600,
    };
    const input = structuredClone(feed);
    for (const [tf, bars] of Object.entries(input.bars))
      if (
        !bars.length ||
        bars.at(-1).time + durations[tf] > Date.now() / 1000 + 5 ||
        Date.now() / 1000 - (bars.at(-1).time + durations[tf]) >
          durations[tf] * 2
      )
        delete input.bars[tf];
    busy = true;
    try {
      const result = await analyze(input);
      if (!fresh() || feed.bars.M1?.at(-1)?.time !== candleTime) {
        error = "Analyse abandonnée : les données ont changé ou expiré.";
        return;
      }
      lastEvaluated = candleTime;
      const decision = confluence(result.agents, state.config.threshold);
      const analysis = {
        ...result,
        decision,
        createdAt: new Date().toISOString(),
        candleTime,
        execution: {
          status: "blocked",
          reason: "Trading automatique désarmé.",
        },
      };
      state.analysis = analysis;
      checkDay();
      if (decision.action === "HOLD") {
        state.lastFired = null;
        analysis.execution.reason = "Confluence inférieure au seuil.";
      } else if (state.halted)
        analysis.execution.reason = "Circuit breaker déclenché.";
      else if (armed) {
        try {
          if (
            state.commands.some((c) =>
              ["pending", "uncertain"].includes(c.status),
            )
          )
            throw Error(
              "Accusé de réception manquant : réconciliation MT4 requise.",
            );
          if (state.lastFired === decision.action)
            throw Error(
              "Ce signal a déjà déclenché un ordre. Attente d’un nouveau consensus.",
            );
          const plan = livePlan(feed, state.config, decision.action);
          const id = Math.max(state.lastId + 1, Math.floor(Date.now() / 1000));
          const command = {
            id,
            cmd: "EXECUTE",
            symbol: feed.symbol,
            login: feed.account.login,
            side: plan.action,
            lots: plan.lots,
            sl: plan.stop,
            tp: plan.target,
            reference: plan.entry,
            maxDrift: Math.abs(plan.entry - plan.stop) * 0.15,
            maxSpreadPoints: state.config.maxSpreadPoints,
            maxRiskPercent: state.config.risk,
            expires: Math.floor(Date.now() / 1000) + 8,
          };
          state.lastId = id;
          state.lastFired = decision.action;
          state.commands.unshift({
            command,
            plan,
            status: "pending",
            createdAt: new Date().toISOString(),
          });
          state.commands = state.commands.slice(0, 200);
          analysis.plan = plan;
          analysis.execution = {
            status: "pending",
            reason: "Ordre envoyé au pont ; attente de confirmation MT4.",
            commandId: id,
          };
        } catch (e) {
          analysis.execution.reason = e.message;
        }
      }
      error = null;
      save();
    } catch (e) {
      error = `Analyse refusée : ${e.message}`;
      lastEvaluated = candleTime;
    } finally {
      busy = false;
    }
  };
  const router = Router();
  router.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  router.get("/availability", (_, res) =>
    res.json({ configured: Boolean(token) }),
  );
  router.use((req, res, next) => {
    const provided = req.headers.authorization?.replace(/^Bearer /, "") || "";
    if (
      !token ||
      token.length < 32 ||
      Buffer.byteLength(provided) !== Buffer.byteLength(token) ||
      !timingSafeEqual(Buffer.from(provided), Buffer.from(token))
    )
      return res.status(401).json({
        error:
          "Clé du pont invalide ou non configurée (32 caractères minimum).",
      });
    next();
  });
  router.use(json({ limit: "1mb" }));
  router.get("/", (_, res) => res.json(snapshot()));
  router.post("/pair", (req, res) => {
    const identity = z
      .object({
        login: z.number().int().positive(),
        server: z.string().min(1).max(150),
      })
      .strict()
      .parse(req.body);
    if (
      state.identity &&
      (state.identity.login !== identity.login ||
        state.identity.server !== identity.server)
    )
      throw Error(
        "Ce pont est associé à un autre compte. Utilisez un DATA_DIR dédié.",
      );
    state.identity = identity;
    save();
    res.json(snapshot());
  });
  router.post("/sync", (req, res) => {
    const input = feedSchema.parse(req.body);
    if (
      !state.identity ||
      state.identity.login !== input.account.login ||
      state.identity.server !== input.account.server
    )
      return res.status(409).json({
        error:
          "Associez d’abord le numéro de compte et le serveur dans le dashboard.",
      });
    if (!/^XAUUSD/i.test(input.symbol))
      throw Error(
        "Ce pont est réservé au symbole XAUUSD, suffixe broker autorisé.",
      );
    if (Math.abs(Date.now() / 1000 - input.capturedAt) > 10)
      throw Error("État MT4 périmé ou horloge incorrecte.");
    if (feed && input.capturedAt < feed.capturedAt)
      throw Error("État MT4 antérieur au dernier reçu.");
    if (state.symbol && state.symbol !== input.symbol)
      throw Error(
        "Le symbole du pont a changé. Utilisez un DATA_DIR dédié pour ce symbole.",
      );
    state.symbol = input.symbol;
    feed = input;
    receivedAt = Date.now();
    checkDay();
    for (const item of state.commands) {
      if (
        ["pending", "uncertain"].includes(item.status) &&
        input.lastCommand.id === item.command.id &&
        input.lastCommand.result !== "none"
      ) {
        item.status =
          input.lastCommand.result === "unknown"
            ? "uncertain"
            : input.lastCommand.result;
        item.ack = input.lastCommand;
        if (state.analysis?.execution.commandId === item.command.id)
          state.analysis.execution = {
            ...state.analysis.execution,
            status: item.status,
            reason: input.lastCommand.reason,
          };
      } else if (
        item.status === "pending" &&
        item.command.expires < Date.now() / 1000
      ) {
        item.status = "uncertain";
        armed = false;
        error =
          "Ordre sans confirmation. Vérifiez le terminal avant toute reprise.";
      }
    }
    save();
    void evaluate();
    const pending = state.commands.find((c) => c.status === "pending");
    // Never deliver queued entries after a halt/disarm. A delivered command may already be executing.
    res.json({
      command:
        armed &&
        !state.halted &&
        fresh() &&
        pending &&
        pending.command.expires >= Date.now() / 1000
          ? pending.command
          : null,
      halted: state.halted,
    });
  });
  router.post("/arm", (req, res) => {
    const enabled = z
      .object({ enabled: z.boolean() })
      .strict()
      .parse(req.body).enabled;
    if (enabled) {
      if (!fresh() || !state.identity)
        throw Error("Connectez le terminal avec des cotations à jour.");
      checkDay();
      if (state.halted) throw Error("Circuit breaker déclenché.");
      if (
        state.commands.some((c) => ["pending", "uncertain"].includes(c.status))
      )
        throw Error("Réconciliation de l’ordre en attente requise.");
    }
    armed = enabled;
    lastEvaluated = null;
    res.json(snapshot());
  });
  router.post("/halt", (_, res) => {
    armed = false;
    state.halted = true;
    save();
    res.json(snapshot());
  });
  router.post("/resume", (_, res) => {
    if (!fresh()) throw Error("Cotations indisponibles.");
    checkDay();
    if (
      state.startEquity > 0 &&
      feed.account.equity <=
        state.startEquity * (1 - state.config.maxDailyLoss / 100)
    )
      throw Error("Limite de perte toujours atteinte.");
    state.halted = false;
    armed = false;
    save();
    res.json(snapshot());
  });
  router.post("/settings", (req, res) => {
    if (armed) throw Error("Désarmez avant de modifier les limites.");
    state.config = configSchema.parse(req.body);
    save();
    res.json(snapshot());
  });
  const halt = () => {
    armed = false;
    state.halted = true;
    save();
  };
  router.post("/reconcile", (req, res) => {
    const { id, resolution } = z
      .object({
        id: z.number().int().positive(),
        resolution: z.enum(["execution_verified", "no_execution_verified"]),
      })
      .strict()
      .parse(req.body);
    const item = state.commands.find((c) => c.command.id === id);
    if (
      !fresh() ||
      !item ||
      item.status !== "uncertain" ||
      item.command.expires >= Date.now() / 1000
    )
      return res.status(409).json({
        error:
          "Réconciliation réservée aux commandes expirées sans confirmation, avec terminal connecté.",
      });
    item.status = "reconciled";
    item.resolution = resolution;
    item.resolvedAt = new Date().toISOString();
    armed = false;
    save();
    res.json(snapshot());
  });
  router.use((err, req, res, next) =>
    res.status(400).json({
      error:
        err instanceof z.ZodError ? "Données du pont invalides." : err.message,
    }),
  );
  return { router, snapshot, halt };
}
