import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import { once } from "node:events";
import { createMt4, confluence, livePlan, feedSchema, assess } from "./mt4.js";
import { buildEvidence, ema, atr } from "./xau-strategy.js";
import { deliverCommand, decodeJson } from "../scripts/mt4-relay.mjs";
function bars(step, n = 250) {
  const end = Math.floor(Date.now() / 1000 / step) * step - step;
  return Array.from({ length: n }, (_, i) => ({
    time: end - (n - 1 - i) * step,
    open: 2600 + i * 0.1,
    high: 2602 + i * 0.1,
    low: 2598 + i * 0.1,
    close: 2600.2 + i * 0.1,
    volume: 100 + (i % 10),
  }));
}
function fixture() {
  const now = Math.floor(Date.now() / 1000);
  return {
    source: "aurum-mt4-v1",
    capturedAt: now,
    connected: true,
    tradeAllowed: true,
    account: {
      login: 12345,
      server: "Test-Demo",
      demo: true,
      currency: "USD",
      balance: 10000,
      equity: 10000,
    },
    symbol: "XAUUSD",
    quote: {
      bid: 2625,
      ask: 2625.2,
      point: 0.01,
      digits: 2,
      tickTime: now,
      tickValue: 1,
      tickSize: 0.01,
      minLot: 0.01,
      maxLot: 100,
      lotStep: 0.01,
      stopPoints: 10,
    },
    bars: {
      D1: bars(86400),
      H1: bars(3600),
      M15: bars(900),
      M5: bars(300),
      M1: bars(60),
      W1: bars(604800),
    },
    calendar: { asOf: now, blocked: false },
    positions: [],
    lastCommand: { id: 0, result: "none", ticket: 0, reason: "" },
  };
}
const config = {
  threshold: 75,
  risk: 0.5,
  rr: 2.5,
  maxDailyLoss: 3,
  maxSpreadPoints: 100,
};
const votes = (action = "BUY") =>
  ["D1", "H1", "M15", "M5", "M1", "COR"].map((id, i) => ({
    id,
    vote: i < 5 ? action : "HOLD",
    facts: {},
    missing: [],
    summary: "Fixture",
    confidence: 75,
  }));
test("judge requires six votes and >=75%, independently of confidence", () => {
  assert.equal(confluence(votes()).action, "BUY");
  assert.equal(confluence(votes("SELL")).action, "SELL");
  assert.equal(
    confluence(votes().map((a, i) => (i === 4 ? { ...a, vote: "HOLD" } : a)))
      .action,
    "HOLD",
  );
  assert.equal(confluence(votes().slice(0, 5)).action, "HOLD");
  assert.equal(confluence(votes(), 84).action, "HOLD");
  assert.equal(confluence(votes(), 75).score, (5 / 6) * 100);
});
test("live sizing respects broker units and refuses stale quotes, calendar, exposure and minimum lot", () => {
  const f = fixture();
  feedSchema.parse(f);
  for (const action of ["BUY", "SELL"]) {
    const p = livePlan(f, config, action);
    assert.ok(p.riskAmount <= 50);
    assert.ok(Math.abs(p.rr - 2.5) < 0.001);
    assert.equal(Math.sign(p.entry - p.stop), action === "BUY" ? 1 : -1);
  }
  assert.throws(
    () =>
      livePlan(
        { ...f, quote: { ...f.quote, tickTime: f.capturedAt - 11 } },
        config,
        "BUY",
      ),
    /périmées/,
  );
  assert.throws(
    () => livePlan({ ...f, calendar: null }, config, "BUY"),
    /Calendrier/,
  );
  assert.throws(
    () =>
      livePlan(
        { ...f, calendar: { ...f.calendar, blocked: true } },
        config,
        "BUY",
      ),
    /Calendrier/,
  );
  assert.throws(
    () =>
      livePlan(
        { ...f, quote: { ...f.quote, ask: f.quote.bid + 2 } },
        config,
        "BUY",
      ),
    /Spread/,
  );
  assert.throws(
    () => livePlan({ ...f, positions: [{ symbol: "XAUUSD" }] }, config, "BUY"),
    /déjà présent/,
  );
  assert.throws(
    () =>
      livePlan({ ...f, account: { ...f.account, balance: 1 } }, config, "BUY"),
    /Lot minimum/,
  );
});
test("technical evidence abstains on missing data and calculates ATR, EMAs and timeframe-specific facts", () => {
  const f = fixture(),
    agents = buildEvidence(f);
  assert.equal(agents.length, 6);
  assert.equal(agents[0].facts.ema50 > agents[0].facts.ema200, true);
  assert.equal(agents[5].vote, "HOLD");
  assert.ok(agents[5].missing.length > 0);
  assert.equal(buildEvidence({ ...f, calendar: null })[0].vote, "HOLD");
  assert.equal(
    buildEvidence({ ...f, bars: {} }).every((a) => a.vote === "HOLD"),
    true,
  );
  assert.equal(ema([1, 2, 3], 3), 2.25);
  assert.ok(Math.abs(atr(f.bars.M5) - 4) < 0.00001);
  assert.ok(agents.find((a) => a.id === "H1").facts.vwap > 0);
  assert.equal(agents.find((a) => a.id === "M5").facts.slDistance, 6);
  assert.ok(agents.find((a) => a.id === "M15").facts.structure);
  assert.ok(agents.find((a) => a.id === "M1").facts.spreadPoints <= 100);
});
test("bridge authenticates, pairs account, executes once automatically and trips daily cutoff", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "aurum-live-")),
    token = "x".repeat(40);
  const service = createMt4(directory, {
    token,
    analyze: async () => ({ agents: votes(), engine: "test fixture" }),
  });
  const app = express();
  app.use("/mt4", service.router);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const request = async (route = "", body, auth = token) => {
    const r = await fetch(
      `http://127.0.0.1:${server.address().port}/mt4${route}`,
      {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Authorization: "Bearer " + auth,
          "Content-Type": "application/json",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
    );
    return { status: r.status, data: await r.json() };
  };
  try {
    assert.equal((await request("", undefined, "wrong")).status, 401);
    assert.equal((await request("/sync", fixture())).status, 409);
    assert.equal(
      (await request("/pair", { login: 12345, server: "Test-Demo" })).status,
      200,
    );
    assert.equal(
      (await request("/sync", { ...fixture(), source: "mt4-bridge-ea" }))
        .status,
      400,
    );
    assert.equal(
      (
        await request("/sync", {
          ...fixture(),
          account: { ...fixture().account, login: 54321 },
        })
      ).status,
      409,
    );
    await request("/sync", fixture());
    assert.equal(
      (await request("/sync", { ...fixture(), symbol: "XAUUSD-other" })).status,
      400,
    );
    assert.equal(service.snapshot().analysis.execution.status, "blocked");
    await request("/arm", { enabled: true });
    await request("/sync", fixture());
    const snapshot = service.snapshot();
    assert.equal(snapshot.commands.length, 1);
    assert.equal(snapshot.commands[0].status, "pending");
    const id = snapshot.commands[0].command.id;
    await request("/sync", fixture());
    assert.equal(service.snapshot().commands.length, 1);
    await request("/sync", {
      ...fixture(),
      lastCommand: {
        id,
        result: "executed",
        ticket: 777,
        reason: "Ticket 777",
      },
    });
    assert.equal(service.snapshot().commands[0].status, "executed");
    await request("/sync", {
      ...fixture(),
      account: { ...fixture().account, equity: 9600 },
    });
    assert.equal(service.snapshot().halted, true);
    assert.equal(service.snapshot().armed, false);
    assert.equal((await request("/resume", {})).status, 400);
    assert.equal(
      (await request("/settings", { ...config, threshold: 74 })).status,
      400,
    );
    const restarted = createMt4(directory, { token });
    assert.equal(restarted.snapshot().armed, false);
    assert.equal(restarted.snapshot().commands[0].status, "executed");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
test("relay supports UTF-16 files, atomically delivers once and refuses expired commands", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aurum-relay-"));
  try {
    const payload = { value: "example" };
    assert.deepEqual(
      decodeJson(
        Buffer.concat([
          Buffer.from([255, 254]),
          Buffer.from(JSON.stringify(payload), "utf16le"),
        ]),
      ),
      payload,
    );
    const command = {
      id: 123,
      cmd: "EXECUTE",
      side: "BUY",
      expires: Math.floor(Date.now() / 1000) + 8,
    };
    assert.equal(deliverCommand(dir, command), true);
    assert.equal(deliverCommand(dir, command), false);
    fs.unlinkSync(path.join(dir, "Aurum_command.json"));
    assert.equal(deliverCommand(dir, command), false);
    assert.throws(
      () => deliverCommand(dir, { ...command, id: 124, expires: 1 }),
      /expirée/,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("unknown acknowledgments block rearming until explicit reconciliation", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aurum-uncertain-")),
    token = "a".repeat(40);
  const f = fixture(),
    id = Math.floor(Date.now() / 1000) - 20;
  fs.writeFileSync(
    path.join(dir, "mt4.json"),
    JSON.stringify({
      identity: { login: 12345, server: "Test-Demo" },
      config,
      halted: false,
      day: new Date().toISOString().slice(0, 10),
      startEquity: 10000,
      commands: [{ command: { id, expires: id + 8 }, status: "pending" }],
      analysis: null,
      lastId: id,
      lastFired: "BUY",
    }),
  );
  const service = createMt4(dir, {
    token,
    analyze: async () => ({ agents: votes(), engine: "test" }),
  });
  const app = express();
  app.use(service.router);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const request = async (route, body) => {
    const r = await fetch(`http://127.0.0.1:${server.address().port}${route}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    return { status: r.status, data: await r.json() };
  };
  try {
    await request("/sync", {
      ...f,
      lastCommand: { id, result: "unknown", ticket: 0, reason: "restarted" },
    });
    assert.equal(service.snapshot().commands[0].status, "uncertain");
    assert.equal((await request("/arm", { enabled: true })).status, 400);
    assert.equal(
      (await request("/reconcile", { id, resolution: "no_execution_verified" }))
        .status,
      200,
    );
    assert.equal(service.snapshot().commands[0].status, "reconciled");
    assert.equal(service.snapshot().armed, false);
    assert.equal((await request("/arm", { enabled: true })).status, 200);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test("news adapter preserves source age and blocks stale or invalid calendar", async () => {
  const { refreshCalendar } = await import("../scripts/mt4-relay.mjs");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aurum-news-"));
  try {
    const input = path.join(dir, "news_status.json"),
      target = path.join(dir, "Aurum_calendar.json");
    fs.writeFileSync(
      input,
      JSON.stringify({ trading_allowed: true, news_risk: "LOW" }),
    );
    refreshCalendar(dir);
    assert.equal(JSON.parse(fs.readFileSync(target)).blocked, false);
    const old = new Date(Date.now() - 600000);
    fs.utimesSync(input, old, old);
    refreshCalendar(dir);
    const cal = JSON.parse(fs.readFileSync(target));
    assert.equal(cal.blocked, true);
    assert.ok(Date.now() / 1000 - cal.asOf > 590);
    fs.writeFileSync(input, JSON.stringify({ trading_allowed: "true" }));
    assert.throws(() => refreshCalendar(dir), /booléen/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("six model calls cannot override missing evidence or deterministic HOLD", async (t) => {
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "synthetic-test-key";
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return {
      ok: true,
      json: async () => ({
        status: "completed",
        output: [
          {
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  vote: "BUY",
                  confidence: 99,
                  summary: "Synthetic model result",
                }),
              },
            ],
          },
        ],
      }),
    };
  });
  try {
    const result = await assess(fixture());
    assert.equal(calls, 6);
    assert.equal(result.agents.length, 6);
    assert.equal(result.agents.find((a) => a.id === "COR").vote, "HOLD");
    assert.equal(result.agents.find((a) => a.id === "M1").vote, "HOLD");
    assert.equal(result.agents.find((a) => a.id === "D1").vote, "BUY");
  } finally {
    if (previous === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous;
  }
});
