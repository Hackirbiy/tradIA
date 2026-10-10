import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { once } from "node:events";
import { createServer } from "node:net";
async function availablePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  await new Promise((r) => server.close(r));
  return port;
}
async function start(dir, port, overrides = {}) {
  const child = spawn(process.execPath, ["server/index.js"], {
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: dir,
      DATA_MODE: "demo",
      OPENAI_API_KEY: "",
      NODE_ENV: "production",
      ...overrides,
    },
    stdio: "ignore",
  });
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) return child;
    } catch {}
    await delay(50);
  }
  child.kill();
  throw Error("Server did not become ready");
}
async function stop(child) {
  if (child.exitCode !== null) return;
  const done = once(child, "exit");
  child.kill();
  await done;
}
test("HTTP paper ledger protects against double fills, persists, halts, and expires analyses", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tradia-api-")),
    port = await availablePort();
  let child = await start(dir, port);
  const request = async (path, body, headers = {}) => {
    const r = await fetch(
      `http://127.0.0.1:${port}/api${path}`,
      body
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json", ...headers },
            body: JSON.stringify(body),
          }
        : undefined,
    );
    return { status: r.status, data: await r.json() };
  };
  try {
    assert.equal((await request("/health")).data.execution, "paper");
    assert.equal(
      (await request("/analyze", { symbol: "INVALID" })).status,
      400,
    );
    assert.equal(
      (await request("/cutoff", {}, { Origin: "https://foreign.example" }))
        .status,
      403,
    );
    const analysis = (await request("/analyze", { symbol: "NVDA" })).data
      .analysis;
    assert.ok(analysis.id);
    assert.equal(analysis.agents.length, 5);
    const results = await Promise.all([
      request("/orders", { analysisId: analysis.id }),
      request("/orders", { analysisId: analysis.id }),
    ]);
    assert.equal(results.filter((r) => r.status === 201).length, 1);
    let desk = (await request("/desk")).data;
    assert.equal(desk.account.positions.length, 1);
    assert.equal(desk.account.equity, 100000);
    assert.equal(desk.history.length, 1);
    const prediction = (await request("/analyze", { symbol: "BTC100" })).data
      .analysis;
    assert.equal(
      (await request("/orders", { analysisId: prediction.id })).status,
      201,
    );
    desk = (await request("/desk")).data;
    assert.equal(desk.account.positions.length, 2);
    assert.ok(
      desk.account.positions.find((p) => p.symbol === "BTC100").quantity *
        0.67 <=
        1000,
    );
    assert.equal((await request("/cutoff", {})).data.halted, true);
    desk = (await request("/desk")).data;
    assert.equal(desk.account.positions.length, 0);
    assert.equal(desk.account.trades.length, 2);
    const aapl = (await request("/analyze", { symbol: "AAPL" })).data.analysis;
    assert.equal(
      (await request("/orders", { analysisId: aapl.id })).status,
      409,
    );
    await stop(child);
    child = await start(dir, port);
    assert.equal((await request("/desk")).data.account.halted, true);
    assert.equal((await request("/resume", {})).status, 200);
    assert.equal(
      (await request("/orders", { analysisId: analysis.id })).status,
      400,
    );
    await stop(child);
    const file = join(dir, "desk.json"),
      s = JSON.parse(readFileSync(file, "utf8"));
    s.analyses.find((a) => a.id === aapl.id).createdAt = new Date(
      Date.now() - 3600000,
    ).toISOString();
    writeFileSync(file, JSON.stringify(s));
    child = await start(dir, port);
    assert.match(
      (await request("/orders", { analysisId: aapl.id })).data.error,
      /expired/,
    );
  } finally {
    await stop(child);
    rmSync(dir, { recursive: true, force: true });
  }
});

// Exercise real HTTP calls through all adapters against controlled provider fixtures.
test("live prediction analysis and orders use the YES outcome and reject stale prices", async () => {
  const { createServer: httpServer } = await import("node:http");
  const dir = mkdtempSync(join(tmpdir(), "tradia-live-")),
    port = await availablePort();
  let stale = false,
    modelCalls = 0;
  const market = () => ({
    id: "999",
    question: "Will the synthetic event occur?",
    outcomes: '["No","Yes"]',
    outcomePrices: '["0.3","0.7"]',
    active: true,
    closed: false,
    acceptingOrders: true,
    updatedAt: new Date(Date.now() - (stale ? 3600000 : 0)).toISOString(),
    description: "Synthetic resolution rules",
  });
  const provider = httpServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/responses") {
      let text = "";
      for await (const chunk of req) text += chunk;
      const body = JSON.parse(text);
      modelCalls++;
      const output =
        body.text.format.name === "decision"
          ? {
              action: "BUY",
              confidence: 80,
              summary: "Synthetic decision",
              catalyst: "Fixture",
              risk: "Fixture",
            }
          : {
              stance: "Bullish",
              confidence: 80,
              summary: "Synthetic analyst",
              points: ["Fixture"],
            };
      res.end(
        JSON.stringify({
          status: "completed",
          output: [
            {
              content: [{ type: "output_text", text: JSON.stringify(output) }],
            },
          ],
        }),
      );
    } else
      res.end(
        JSON.stringify(req.url.startsWith("/markets?") ? [market()] : market()),
      );
  });
  provider.listen(0, "127.0.0.1");
  await once(provider, "listening");
  const base = `http://127.0.0.1:${provider.address().port}`;
  const child = await start(dir, port, {
    DATA_MODE: "live",
    OPENAI_API_KEY: "synthetic-test-key",
    OPENAI_BASE_URL: base,
    POLYMARKET_BASE_URL: base,
    SOCIAL_SENTIMENT_URL: "",
  });
  const request = async (path, body) => {
    const r = await fetch(
      `http://127.0.0.1:${port}/api${path}`,
      body
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        : undefined,
    );
    return { status: r.status, data: await r.json() };
  };
  try {
    const desk = (await request("/desk")).data;
    assert.ok(desk.assets.some((a) => a.symbol === "PM-999"));
    const analyzed = await request("/analyze", { symbol: "PM-999" });
    assert.equal(analyzed.status, 200);
    assert.equal(modelCalls, 6);
    assert.equal(analyzed.data.analysis.context.asset.price, 0.7);
    stale = true;
    assert.match(
      (await request("/orders", { analysisId: analyzed.data.analysis.id })).data
        .error,
      /older than 15 minutes/,
    );
    stale = false;
    const order = await request("/orders", {
      analysisId: analyzed.data.analysis.id,
    });
    assert.equal(order.status, 201);
    assert.equal(order.data.position.entry, 0.7);
    assert.ok(order.data.position.quantity * 0.7 <= 1000);
    const closed = await request(
      `/positions/${order.data.position.id}/close`,
      {},
    );
    assert.equal(closed.status, 200);
    assert.equal(closed.data.positions.length, 0);
    assert.equal(closed.data.equity, 100000);
  } finally {
    await stop(child);
    await new Promise((r) => provider.close(r));
    rmSync(dir, { recursive: true, force: true });
  }
});
