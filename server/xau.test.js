import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { once } from "node:events";
import { xauRouter, judge, specialists, executeJudge } from "./xau.js";
import { telegramReply } from "./telegram.js";
const settings = { risk: 0.5, threshold: 75, rr: 2.5 };
test("equal-weight judge handles ties, missing consensus, SELL geometry and halt", () => {
  assert.equal(judge(specialists, settings).action, "HOLD");
  assert.equal(
    judge(specialists, { ...settings, threshold: 65 }).action,
    "HOLD",
  );
  const aligned = specialists.map((a, i) => ({
    ...a,
    vote: i < 5 ? "BUY" : "HOLD",
  }));
  assert.equal(judge(aligned, settings).action, "BUY");
  assert.equal(
    judge(specialists, { ...settings, threshold: 80 }).action,
    "HOLD",
  );
  assert.equal(judge(specialists, settings, true).action, "HOLD");
  const tie = specialists.map((a, i) => ({
    ...a,
    vote: i < 3 ? "BUY" : "SELL",
  }));
  assert.equal(judge(tie, { ...settings, threshold: 50 }).action, "HOLD");
  const sell = judge(
    specialists.map((a) => ({ ...a, vote: "SELL" })),
    settings,
  );
  assert.equal(sell.action, "SELL");
  assert.ok(sell.stop > sell.entry);
  assert.ok(sell.target < sell.entry);
  assert.ok(
    Math.abs((sell.entry - sell.target) / (sell.stop - sell.entry) - 2.5) <
      1e-8,
  );
});
test("XAU API persists orders, rejects duplicates, validates risk and enforces halt", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "aurum-"));
  const app = express();
  app.use(express.json());
  app.use("/xau", xauRouter(dir));
  app.use((err, req, res, next) =>
    res.status(400).json({ error: err.message }),
  );
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const request = async (route = "", body) => {
    const r = await fetch(
      `http://127.0.0.1:${server.address().port}/xau${route}`,
      body === undefined
        ? {}
        : {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
    );
    return { status: r.status, data: await r.json() };
  };
  try {
    assert.equal(
      (await request("/settings", { ...settings, threshold: 74 })).status,
      400,
    );
    assert.equal(
      (await request("/settings", { ...settings, risk: 10 })).status,
      400,
    );
    const first = (await request("/analyze", {})).data;
    assert.equal(first.analyses[0].execution.status, "blocked");
    assert.equal(first.orders.length, 0);
    await request("/halt", {});
    const halted = (await request("/analyze", {})).data;
    assert.match(halted.analyses[0].execution.reason, /Coupe-circuit/);
    await request("/resume", {});
    assert.equal((await request()).data.orders.length, 0);
    assert.equal((await request("/candles?tf=invalid")).status, 400);
    const reopened = xauRouter(dir);
    assert.ok(reopened);
    const { readFileSync } = await import("node:fs");
    const persisted = JSON.parse(
      readFileSync(path.join(dir, "xau.json"), "utf8"),
    );
    assert.equal(persisted.orders.length, 0);
    assert.equal(persisted.analyses.length, 2);
    assert.equal(persisted.settings.threshold, 75);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  }
});
test("automatic judge enforces confluence, risk, deduplication, position limit, expiry and cutoff", () => {
  const agents = specialists.map((a, i) => ({
    ...a,
    vote: i < 5 ? "BUY" : "HOLD",
  }));
  const analysis = { id: "a", createdAt: new Date().toISOString(), agents };
  const state = { settings, halted: false, orders: [], balance: 10000 };
  assert.equal(executeJudge(state, analysis).status, "executed");
  assert.equal(state.orders[0].action, "BUY");
  assert.equal(state.orders[0].execution, "automatic");
  assert.ok(state.orders[0].riskAmount <= 50);
  assert.equal(executeJudge(state, analysis).status, "blocked");
  assert.equal(state.orders.length, 1);
  assert.match(
    executeJudge(state, { ...analysis, id: "b" }).reason,
    /déjà ouverte/,
  );
  state.orders[0].status = "closed";
  state.halted = true;
  assert.equal(executeJudge(state, { ...analysis, id: "b" }).status, "blocked");
  state.halted = false;
  assert.equal(
    executeJudge(state, {
      ...analysis,
      id: "b",
      createdAt: new Date(Date.now() - 6 * 60000).toISOString(),
    }).status,
    "blocked",
  );
  const sellAgents = agents.map((a) => ({
    ...a,
    vote: a.vote === "BUY" ? "SELL" : "HOLD",
  }));
  assert.equal(
    executeJudge(state, { ...analysis, id: "b", agents: sellAgents }).status,
    "executed",
  );
  assert.equal(state.orders[0].action, "SELL");
  assert.ok(state.orders[0].stop > state.orders[0].entry);
  assert.equal(
    executeJudge({ ...state, orders: [], balance: 1 }, { ...analysis, id: "c" })
      .status,
    "blocked",
  );
});
test("Telegram only exposes simulation to configured private identity", () => {
  const msg = {
    chat: { type: "private", id: 42 },
    from: { id: 42 },
    text: "/juge",
  };
  const snapshot = () => ({
    balance: 10000,
    orders: [],
    halted: false,
    decision: judge(specialists, settings),
  });
  assert.match(telegramReply(msg, "42", snapshot), /DONNÉES SIMULÉES/);
  assert.equal(
    telegramReply({ ...msg, from: { id: 2 } }, "42", snapshot),
    null,
  );
  assert.equal(
    telegramReply({ ...msg, chat: { type: "group", id: 42 } }, "42", snapshot),
    null,
  );
  assert.equal(telegramReply(msg, "43", snapshot), null);
  assert.equal(telegramReply({ ...msg, text: "/buy" }, "42", snapshot), null);
  assert.match(
    telegramReply({ ...msg, text: "/statut" }, "42", snapshot),
    /Positions virtuelles : 0/,
  );
});

test("Telegram exposes MT4 status and stop only to the private authorized user", () => {
  let halted = false;
  const live = () => ({
    identity: { login: 12345 },
    feed: {
      account: { demo: true, equity: 10000, currency: "USD" },
      positions: [],
    },
    connected: true,
    armed: !halted,
    halted,
    dailyLoss: 0,
    analysis: {
      decision: { action: "BUY", score: 83.333, buy: 5, sell: 0, hold: 1 },
      engine: "test",
      execution: { reason: "test" },
    },
  });
  const message = {
    chat: { id: 42, type: "private" },
    from: { id: 42 },
    text: "/statut",
  };
  assert.match(telegramReply(message, "42", live), /DÉMO BROKER/);
  assert.match(
    telegramReply({ ...message, text: "/juge" }, "42", live),
    /83.3/,
  );
  telegramReply(
    { ...message, text: "/stop", from: { id: 41 } },
    "42",
    live,
    () => (halted = true),
  );
  assert.equal(halted, false);
  assert.match(
    telegramReply(
      { ...message, text: "/stop" },
      "42",
      live,
      () => (halted = true),
    ),
    /déclenché/,
  );
  assert.equal(halted, true);
});
