export const LIMITS = Object.freeze({
  initialCapital: 100000,
  maxLoss: 0.05,
  maxPosition: 0.1,
  riskPerTrade: 0.01,
  minConfidence: 65,
});
export function equity(state) {
  return (
    state.cash +
    state.positions.reduce((sum, p) => sum + p.quantity * p.markPrice, 0)
  );
}
export function riskPlan(state, context, decision) {
  const accountEquity = equity(state),
    price = context.asset.price;
  const prediction = context.asset.type === "prediction";
  const stop = prediction ? price * 0.85 : price * 0.965;
  const target = prediction
    ? Math.min(0.99, price + (price - stop) * 2.5)
    : price * 1.0875;
  const riskPerUnit = prediction ? price : price - stop; // Binary contracts can gap to zero.
  const quantity = Math.max(
    0,
    Math.floor(
      Math.min(accountEquity * LIMITS.maxPosition, state.cash) / price,
    ),
  );
  const riskQuantity = Math.max(
    0,
    Math.floor((accountEquity * LIMITS.riskPerTrade) / riskPerUnit),
  );
  const size = Math.min(quantity, riskQuantity);
  let reason = null;
  if (state.halted) reason = "Emergency cutoff is active";
  else if (accountEquity <= LIMITS.initialCapital * (1 - LIMITS.maxLoss))
    reason = "5% account loss cutoff reached";
  else if (context.asset.tradable === false || (prediction && price >= 0.99))
    reason =
      "This prediction contract is closed or has insufficient upside for a new entry";
  else if (decision.action !== "BUY")
    reason =
      "This desk opens long positions only. HOLD and SELL calls do not open trades.";
  else if (decision.confidence < LIMITS.minConfidence)
    reason = "Confidence is below the 65% entry threshold";
  else if (state.positions.some((p) => p.symbol === context.asset.symbol))
    reason = "A position is already open in this asset";
  else if (!Number.isFinite(price) || price <= 0 || !size)
    reason = "Insufficient cash or invalid price";
  return {
    allowed: !reason,
    reason,
    quantity: size,
    entry: price,
    stop,
    target,
    notional: size * price,
    maxLoss: size * riskPerUnit,
    riskPercent: ((size * riskPerUnit) / accountEquity) * 100,
    rewardRisk: prediction ? "Variable" : "2.5",
    allocation: ((size * price) / accountEquity) * 100,
  };
}
export function applyMarks(state, prices) {
  for (const position of [...state.positions]) {
    const price = prices[position.symbol];
    if (
      !Number.isFinite(price) ||
      price < 0 ||
      (price === 0 && position.type !== "prediction")
    )
      continue;
    position.markPrice = price;
    if (price <= position.stop || price >= position.target)
      closePosition(
        state,
        position.id,
        price,
        price <= position.stop ? "Stop loss" : "Take profit",
      );
  }
  if (equity(state) <= LIMITS.initialCapital * (1 - LIMITS.maxLoss)) {
    state.halted = true;
    for (const p of [...state.positions])
      closePosition(state, p.id, p.markPrice, "Account loss cutoff");
  }
}
export function closePosition(state, id, price, reason = "Manual close") {
  const p = state.positions.find((p) => p.id === id);
  if (!p) throw Error("Position not found");
  state.cash += p.quantity * price;
  state.trades.unshift({
    ...p,
    exit: price,
    pnl: (price - p.entry) * p.quantity,
    closedAt: new Date().toISOString(),
    reason,
  });
  state.positions = state.positions.filter((p) => p.id !== id);
}
