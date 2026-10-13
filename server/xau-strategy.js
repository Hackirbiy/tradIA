// Closed-candle, reproducible evidence. SMC definitions are deliberately explicit.
export const TF = ["D1", "H1", "M15", "M5", "M1"];
export const ema = (values, period) =>
  values.reduce((v, x, i) => (i ? v + ((x - v) * 2) / (period + 1) : x), 0);
export function atr(bars, period = 14) {
  if (bars.length < period + 1) return null;
  const ranges = bars
    .slice(1)
    .map((b, i) =>
      Math.max(
        b.high - b.low,
        Math.abs(b.high - bars[i].close),
        Math.abs(b.low - bars[i].close),
      ),
    );
  let value = ranges.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (const x of ranges.slice(period))
    value = (value * (period - 1) + x) / period;
  return value;
}
const sign = (n) => (n > 0 ? 1 : n < 0 ? -1 : 0);
const vote = (n) => (n > 0 ? "BUY" : n < 0 ? "SELL" : "HOLD");
const round = (n) =>
  Number.isFinite(n) ? Math.round(n * 10000) / 10000 : null;
function structure(bars) {
  const swings = { highs: [], lows: [] };
  for (let i = 2; i < bars.length - 2; i++) {
    const neighbours = [...bars.slice(i - 2, i), ...bars.slice(i + 1, i + 3)];
    if (neighbours.every((b) => b.high < bars[i].high))
      swings.highs.push(bars[i].high);
    if (neighbours.every((b) => b.low > bars[i].low))
      swings.lows.push(bars[i].low);
  }
  const high = swings.highs.at(-1),
    low = swings.lows.at(-1),
    close = bars.at(-1).close;
  const trend =
    high > swings.highs.at(-2) && low > swings.lows.at(-2)
      ? 1
      : high < swings.highs.at(-2) && low < swings.lows.at(-2)
        ? -1
        : 0;
  const breakDirection = close > high ? 1 : close < low ? -1 : 0;
  return {
    swingHigh: high ?? null,
    swingLow: low ?? null,
    trend,
    direction: breakDirection,
    event: !breakDirection
      ? "Aucune cassure"
      : trend && trend !== breakDirection
        ? "CHoCH"
        : "BOS",
  };
}
function session(bars) {
  const day = Math.floor(bars.at(-1).time / 86400);
  const current = bars.filter((b) => Math.floor(b.time / 86400) === day);
  const volume = current.reduce((s, b) => s + b.volume, 0);
  const low = Math.min(...current.map((b) => b.low)),
    high = Math.max(...current.map((b) => b.high));
  const bins = Array(24).fill(0),
    step = (high - low) / 24 || 1;
  for (const b of current)
    bins[
      Math.min(23, Math.floor(((b.high + b.low + b.close) / 3 - low) / step))
    ] += b.volume;
  const poc = bins.indexOf(Math.max(...bins));
  let left = poc,
    right = poc,
    captured = bins[poc];
  while (captured < volume * 0.7 && (left > 0 || right < 23)) {
    if (right < 23 && (left === 0 || bins[right + 1] >= bins[left - 1]))
      captured += bins[++right];
    else captured += bins[--left];
  }
  return {
    vwap: volume
      ? current.reduce(
          (s, b) => s + ((b.high + b.low + b.close) / 3) * b.volume,
          0,
        ) / volume
      : null,
    poc: low + (poc + 0.5) * step,
    valueLow: low + left * step,
    valueHigh: low + (right + 1) * step,
    profile:
      "24 classes de prix, volume ticks, session UTC, aire de valeur 70 %",
  };
}
function zones(bars) {
  let fvg = null,
    ob = null;
  for (let i = Math.max(2, bars.length - 40); i < bars.length; i++) {
    if (
      bars[i].low > bars[i - 2].high &&
      !bars.slice(i + 1).some((b) => b.low <= bars[i - 2].high)
    )
      fvg = { direction: 1, low: bars[i - 2].high, high: bars[i].low };
    if (
      bars[i].high < bars[i - 2].low &&
      !bars.slice(i + 1).some((b) => b.high >= bars[i - 2].low)
    )
      fvg = { direction: -1, low: bars[i].high, high: bars[i - 2].low };
    const previous = bars.slice(Math.max(0, i - 8), i);
    const direction =
      bars[i].close > Math.max(...previous.map((b) => b.high))
        ? 1
        : bars[i].close < Math.min(...previous.map((b) => b.low))
          ? -1
          : 0;
    if (direction) {
      const base = [...previous]
        .reverse()
        .find((b) => sign(b.close - b.open) === -direction);
      if (
        base &&
        !bars
          .slice(i + 1)
          .some((b) =>
            direction > 0 ? b.close < base.low : b.close > base.high,
          )
      )
        ob = { direction, low: base.low, high: base.high };
    }
  }
  return { fvg, orderBlock: ob };
}
function correlation(a, b) {
  const byTime = new Map(b.map((c) => [c.time, c.close]));
  const pairs = a
    .filter((c) => byTime.has(c.time))
    .slice(-31)
    .map((c) => [c.close, byTime.get(c.time)]);
  if (pairs.length < 21) return null;
  const changes = pairs
    .slice(1)
    .map((p, i) => [p[0] / pairs[i][0] - 1, p[1] / pairs[i][1] - 1]);
  const means = [0, 1].map(
    (k) => changes.reduce((s, c) => s + c[k], 0) / changes.length,
  );
  const cov = changes.reduce(
    (s, c) => s + (c[0] - means[0]) * (c[1] - means[1]),
    0,
  );
  const variance = [0, 1].map((k) =>
    changes.reduce((s, c) => s + (c[k] - means[k]) ** 2, 0),
  );
  return variance[0] && variance[1]
    ? cov / Math.sqrt(variance[0] * variance[1])
    : null;
}
export function buildEvidence(feed, now = Date.now()) {
  return [...TF, "COR"].map((id) => {
    const b = feed.bars[id],
      missing = [];
    if (id !== "COR" && (!b || b.length < (id === "D1" ? 220 : 40)))
      return {
        id,
        vote: "HOLD",
        confidence: 0,
        summary: "Historique de bougies clôturées insuffisant.",
        facts: {},
        missing: ["historique"],
        tags: ["Historique manquant"],
      };
    let direction = 0,
      facts = {},
      summary = "";
    if (id === "D1") {
      const closes = b.map((c) => c.close),
        fast = ema(closes, 50),
        slow = ema(closes, 200),
        st = structure(b);
      const weekly = feed.bars.W1;
      const cal = feed.calendar;
      const calendarReady =
        cal && now / 1000 - cal.asOf >= -30 && now / 1000 - cal.asOf <= 300;
      if (!calendarReady) missing.push("calendrier à jour");
      if (!weekly?.length) missing.push("historique W1");
      direction =
        calendarReady && !cal.blocked && weekly?.length
          ? b.at(-1).close > fast && fast > slow && st.direction >= 0
            ? 1
            : b.at(-1).close < fast && fast < slow && st.direction <= 0
              ? -1
              : 0
          : 0;
      facts = {
        ema50: round(fast),
        ema200: round(slow),
        structure: st,
        previousDayHigh: b.at(-1).high,
        previousDayLow: b.at(-1).low,
        previousWeekHigh: weekly?.at(-1)?.high ?? null,
        previousWeekLow: weekly?.at(-1)?.low ?? null,
        calendar: calendarReady ? cal : null,
      };
      summary = `Tendance EMA 50/200, ${st.event}. ${!calendarReady ? "Calendrier absent ou périmé." : cal.blocked ? "Annonce macro : entrées bloquées." : "Filtre calendrier ouvert."}`;
    } else if (id === "H1") {
      const st = structure(b),
        zone = zones(b),
        profile = session(b),
        close = b.at(-1).close;
      const bias =
        zone.orderBlock?.direction || zone.fvg?.direction || st.direction;
      direction =
        profile.vwap && sign(close - profile.vwap) === bias ? bias : 0;
      facts = { ...zone, ...profile, atr: round(atr(b)), structure: st };
      summary = `Zones de déséquilibre et dernier order block non invalidé ; confirmation par VWAP de session calculée sur les ticks.`;
    } else if (id === "M15") {
      const last = b.at(-1),
        prior = b.slice(-17, -1),
        high = Math.max(...prior.map((c) => c.high)),
        low = Math.min(...prior.map((c) => c.low));
      const sweep =
        last.low < low && last.close > low
          ? 1
          : last.high > high && last.close < high
            ? -1
            : 0;
      const st = structure(b),
        profile = session(b);
      direction =
        sweep && st.direction !== -sweep
          ? sweep
          : st.direction &&
              profile.vwap &&
              sign(last.close - profile.vwap) === st.direction
            ? st.direction
            : 0;
      facts = {
        sweep,
        sweptHigh: high,
        sweptLow: low,
        structure: st,
        ...profile,
      };
      summary = `Sweep des 16 bougies précédentes et ${st.event}. Profil de session approximé par les volumes ticks.`;
    } else if (id === "M5") {
      const closes = b.map((c) => c.close),
        fast = ema(closes, 9),
        slow = ema(closes, 21),
        window = b.slice(-14),
        low = Math.min(...window.map((c) => c.low)),
        high = Math.max(...window.map((c) => c.high));
      const stochastic =
        high > low ? ((closes.at(-1) - low) / (high - low)) * 100 : 50;
      const momentum = closes.at(-1) - closes.at(-4);
      direction =
        fast > slow && momentum > 0 && stochastic >= 20 && stochastic < 80
          ? 1
          : fast < slow && momentum < 0 && stochastic > 20 && stochastic <= 80
            ? -1
            : 0;
      facts = {
        ema9: round(fast),
        ema21: round(slow),
        stochasticK14: round(stochastic),
        momentum3: round(momentum),
        atr14: round(atr(b)),
        slDistance: round(atr(b) * 1.5),
      };
      summary =
        "EMA 9/21, momentum sur 3 bougies, stochastique hors extrêmes. Stop dynamique à 1,5 × ATR M5.";
    } else if (id === "M1") {
      const last = b.at(-1),
        prev = b.slice(-21, -1),
        avg = prev.reduce((s, c) => s + c.volume, 0) / prev.length;
      const spike = avg > 0 ? last.volume / avg : 0,
        high = Math.max(...prev.slice(-5).map((c) => c.high)),
        low = Math.min(...prev.slice(-5).map((c) => c.low));
      const spread = (feed.quote.ask - feed.quote.bid) / feed.quote.point;
      direction =
        spread <= 100 && spike >= 1.5
          ? last.close > high
            ? 1
            : last.close < low
              ? -1
              : 0
          : 0;
      facts = {
        tickVolume: last.volume,
        volumeRatio: round(spike),
        microHigh: high,
        microLow: low,
        spreadPoints: round(spread),
        spreadLimitPoints: 100,
      };
      summary =
        "Cassure des 5 bougies précédentes, volume ≥ 1,5 × moyenne sur 20 bougies, spread ≤ 100 points.";
    } else {
      const dxy = feed.bars.DXY,
        yields = feed.bars.US10Y,
        gold = feed.bars.H1;
      if (!dxy?.length || !yields?.length || !gold?.length)
        missing.push("DXY et taux US 10 ans H1");
      const dc = missing.length ? null : correlation(gold, dxy),
        yc = missing.length ? null : correlation(gold, yields);
      if (dc === null || yc === null)
        missing.push("21 bougies H1 synchronisées");
      const dm = dxy?.length >= 4 ? dxy.at(-1).close - dxy.at(-4).close : 0,
        ym =
          yields?.length >= 4 ? yields.at(-1).close - yields.at(-4).close : 0;
      direction =
        !missing.length && dc < -0.2 && yc < -0.2 && sign(dm) === sign(ym)
          ? -sign(dm)
          : 0;
      facts = {
        correlationDXY: round(dc),
        correlationUS10Y: round(yc),
        dollarMomentum: round(dm),
        yieldMomentum: round(ym),
      };
      summary =
        "Corrélations des rendements H1 et direction du dollar / taux US. Absence de flux = abstention.";
    }
    return {
      id,
      vote: vote(direction),
      confidence: direction ? 75 : 0,
      summary,
      facts,
      missing,
      tags: [
        direction ? "Conditions alignées" : "En observation",
        missing.length ? "Données incomplètes" : "Données MT4",
      ],
    };
  });
}
