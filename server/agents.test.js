import test from "node:test";
import assert from "node:assert/strict";
import { analyze } from "./agents.js";
import { demoContext, marketContext } from "./data.js";
const analyst = {
  stance: "Bullish",
  confidence: 80,
  summary: "Synthetic research only",
  points: ["Evidence from fixture"],
};
const judge = {
  action: "BUY",
  confidence: 80,
  summary: "Fixture decision",
  catalyst: "Fixture catalyst",
  risk: "Fixture risk",
};
function useEnv(t, values) {
  for (const [key, value] of Object.entries(values)) {
    const old = process.env[key];
    process.env[key] = value;
    t.after(() => {
      if (old === undefined) delete process.env[key];
      else process.env[key] = old;
    });
  }
}
test("model debate passes three analysts to bear, four to neutral and five to judge", async (t) => {
  useEnv(t, { OPENAI_API_KEY: "synthetic-test-key" });
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.ok(url.endsWith("/responses"));
    const body = JSON.parse(options.body),
      payload = JSON.parse(body.input[1].content);
    calls.push(payload);
    const output = body.text.format.name === "decision" ? judge : analyst;
    return new Response(
      JSON.stringify({
        status: "completed",
        output: [
          { content: [{ type: "output_text", text: JSON.stringify(output) }] },
        ],
      }),
    );
  });
  const result = await analyze(demoContext("NVDA"));
  assert.equal(result.engine, "OpenAI");
  assert.equal(calls.length, 6);
  assert.equal(calls[3].prior.length, 3);
  assert.equal(calls[4].debate.length, 4);
  assert.equal(calls[5].agents.length, 5);
  assert.equal(result.decision.action, "BUY");
});
test("malformed, out-of-range and incomplete model results fail closed", async (t) => {
  useEnv(t, { OPENAI_API_KEY: "synthetic-test-key" });
  for (const [status, text] of [
    ["completed", "not json"],
    ["completed", JSON.stringify({ ...analyst, confidence: 110 })],
    ["incomplete", JSON.stringify(analyst)],
  ]) {
    const mock = t.mock.method(
      globalThis,
      "fetch",
      async () =>
        new Response(
          JSON.stringify({
            status,
            output: [{ content: [{ type: "output_text", text }] }],
          }),
        ),
    );
    await assert.rejects(analyze(demoContext("NVDA")));
    mock.mock.restore();
  }
});
test("live context uses provider evidence and exposes optional-source failures", async (t) => {
  useEnv(t, {
    DATA_MODE: "live",
    FINNHUB_API_KEY: "synthetic-test-key",
    SOCIAL_SENTIMENT_URL: "",
  });
  t.mock.method(globalThis, "fetch", async (url) => {
    if (url.includes("/quote?"))
      return Response.json({
        c: 155.5,
        dp: 1.2,
        t: Math.floor(Date.now() / 1000),
      });
    return new Response("{}", { status: 503 });
  });
  const c = await marketContext("NVDA");
  assert.equal(c.asset.price, 155.5);
  assert.equal(c.mode, "live");
  assert.equal(c.candles.length, 0);
  assert.equal(c.news.length, 0);
  assert.ok(c.warnings.includes("News unavailable"));
  assert.equal(c.social, null);
});
test("live quotes reject zero, stale, non-numeric and future data", async (t) => {
  useEnv(t, { DATA_MODE: "live", FINNHUB_API_KEY: "synthetic-test-key" });
  for (const quote of [
    { c: 0, dp: 1, t: Date.now() / 1000 },
    { c: "155", dp: 1, t: Date.now() / 1000 },
    { c: 155, dp: 1, t: 1 },
    { c: 155, dp: 1, t: Date.now() / 1000 + 3600 },
  ]) {
    const mock = t.mock.method(globalThis, "fetch", async () =>
      Response.json(quote),
    );
    await assert.rejects(marketContext("NVDA"));
    mock.mock.restore();
  }
});
