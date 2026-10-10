import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { riskPlan, applyMarks, equity, closePosition } from "./risk.js";
import { demoContext } from "./data.js";
import { createStore } from "./store.js";
const state = () => ({
  cash: 100000,
  halted: false,
  positions: [],
  trades: [],
  analyses: [],
});
const decision = { action: "BUY", confidence: 84 };
test("stock sizing is bounded by cash, 10% allocation and 1% risk", () => {
  const s = state(),
    p = riskPlan(s, demoContext("NVDA"), decision);
  assert.ok(p.allowed);
  assert.ok(p.notional <= 10000);
  assert.ok(p.maxLoss <= 1000);
  assert.ok(p.stop < p.entry);
  assert.ok(p.target > p.entry);
  s.cash = 100;
  const small = riskPlan(s, demoContext("NVDA"), decision);
  assert.equal(small.allowed, false);
});
test("binary contracts reserve the risk budget for total loss", () => {
  const p = riskPlan(state(), demoContext("BTC100"), decision);
  assert.ok(p.allowed);
  assert.ok(p.quantity * 0.67 <= 1000);
  assert.equal(p.maxLoss, p.notional);
  assert.ok(p.target <= 0.99);
});
test("cutoff, low confidence, HOLD, SELL and duplicate assets block entries", () => {
  for (const action of ["HOLD", "SELL"])
    assert.equal(
      riskPlan(state(), demoContext("NVDA"), { ...decision, action }).allowed,
      false,
    );
  assert.equal(
    riskPlan(state(), demoContext("NVDA"), { ...decision, confidence: 64 })
      .allowed,
    false,
  );
  assert.equal(
    riskPlan({ ...state(), halted: true }, demoContext("NVDA"), decision)
      .allowed,
    false,
  );
  assert.equal(
    riskPlan({ ...state(), cash: 95000 }, demoContext("NVDA"), decision)
      .allowed,
    false,
  );
  assert.equal(
    riskPlan(
      {
        ...state(),
        positions: [{ symbol: "NVDA", quantity: 1, markPrice: 142.87 }],
      },
      demoContext("NVDA"),
      decision,
    ).allowed,
    false,
  );
});
const position = (overrides = {}) => ({
  id: "p1",
  symbol: "NVDA",
  quantity: 100,
  entry: 100,
  markPrice: 100,
  stop: 96.5,
  target: 108.75,
  ...overrides,
});
test("stop fills at observed gap price, persists realized loss and removes position", () => {
  const s = { ...state(), cash: 90000, positions: [position()] };
  applyMarks(s, { NVDA: 90 });
  assert.equal(s.positions.length, 0);
  assert.equal(s.cash, 99000);
  assert.equal(s.trades[0].pnl, -1000);
  assert.equal(s.trades[0].reason, "Stop loss");
});
test("take profit and loss cutoff liquidate without restoring cash incorrectly", () => {
  const s = { ...state(), cash: 90000, positions: [position()] };
  applyMarks(s, { NVDA: 110 });
  assert.equal(s.cash, 101000);
  assert.equal(s.trades[0].reason, "Take profit");
  const loss = { ...state(), cash: 85000, positions: [position()] };
  applyMarks(loss, { NVDA: 95 });
  assert.equal(loss.halted, true);
  assert.equal(equity(loss), 94500);
  assert.equal(loss.positions.length, 0);
});
test("unknown positions do not mutate the ledger", () => {
  const s = state();
  assert.throws(() => closePosition(s, "missing", 100));
  assert.equal(s.cash, 100000);
});
test("atomic ledger reload preserves positions, history and halt state", () => {
  const dir = mkdtempSync(join(tmpdir(), "tradia-store-"));
  try {
    const store = createStore(dir);
    store.get().halted = true;
    store.get().positions.push(position());
    store.get().analyses.push({ id: "a1" });
    store.save();
    assert.deepEqual(createStore(dir).get(), store.get());
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("closed contracts cannot open; zero-valued binary positions realize total loss", () => {
  const context = demoContext("BTC100");
  context.asset.tradable = false;
  assert.equal(riskPlan(state(), context, decision).allowed, false);
  const s = {
    ...state(),
    cash: 99000,
    positions: [
      position({
        symbol: "BTC100",
        type: "prediction",
        quantity: 1000,
        entry: 1,
        markPrice: 1,
        stop: 0.85,
        target: 0.99,
      }),
    ],
  };
  applyMarks(s, { BTC100: 0 });
  assert.equal(s.positions.length, 0);
  assert.equal(s.cash, 99000);
  assert.equal(s.trades[0].pnl, -1000);
});
