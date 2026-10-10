export const assets = [
  {
    symbol: "NVDA",
    name: "NVIDIA Corporation",
    short: "NVIDIA",
    price: 142.87,
    change: 2.34,
    color: "#77aa35",
    sector: "Technology",
    type: "stock",
  },
  {
    symbol: "AAPL",
    name: "Apple Inc.",
    short: "Apple",
    price: 228.26,
    change: 0.86,
    color: "#737e91",
    sector: "Technology",
    type: "stock",
  },
  {
    symbol: "MSFT",
    name: "Microsoft Corporation",
    short: "Microsoft",
    price: 428.79,
    change: 1.12,
    color: "#529de5",
    sector: "Technology",
    type: "stock",
  },
  {
    symbol: "TSLA",
    name: "Tesla, Inc.",
    short: "Tesla",
    price: 248.5,
    change: -1.43,
    color: "#e1666b",
    sector: "Automotive",
    type: "stock",
  },
  {
    symbol: "AMZN",
    name: "Amazon.com, Inc.",
    short: "Amazon",
    price: 206.84,
    change: 0.74,
    color: "#e59b42",
    sector: "Consumer cyclical",
    type: "stock",
  },
  {
    symbol: "GOOGL",
    name: "Alphabet Inc.",
    short: "Alphabet",
    price: 176.33,
    change: -0.32,
    color: "#5488e5",
    sector: "Technology",
    type: "stock",
  },
  {
    symbol: "BTC100",
    name: "Bitcoin above $100k at year end?",
    short: "Bitcoin above $100k?",
    price: 0.67,
    change: 3.08,
    color: "#ed9d42",
    sector: "Crypto",
    type: "prediction",
  },
  {
    symbol: "FEDCUT",
    name: "Fed rate cut at the next meeting?",
    short: "Fed rate cut?",
    price: 0.78,
    change: 1.3,
    color: "#7655de",
    sector: "Economics",
    type: "prediction",
  },
  {
    symbol: "AI",
    name: "AI spending exceeds $300B this year?",
    short: "AI spending > $300B?",
    price: 0.82,
    change: -2.38,
    color: "#439997",
    sector: "Technology",
    type: "prediction",
  },
];
export function candles(asset, count = 64) {
  let seed = [...asset.symbol].reduce((s, c) => s + c.charCodeAt(0), 0);
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  let previous = asset.price * 0.95;
  return Array.from({ length: count }, (_, i) => {
    const open = previous;
    const close =
      i === count - 1
        ? asset.price
        : asset.price *
          (0.948 +
            (i / count) * 0.052 +
            Math.sin(i * 0.29) * 0.009 +
            (random() - 0.5) * 0.009);
    previous = close;
    return {
      open,
      close,
      high: Math.max(open, close) + asset.price * random() * 0.005,
      low: Math.min(open, close) - asset.price * random() * 0.005,
      volume: 200 + random() * 800,
    };
  });
}
export function demoContext(symbol) {
  const asset = assets.find((a) => a.symbol === symbol);
  if (!asset) throw new Error("Unknown asset");
  return {
    asset: { ...asset },
    candles: candles(asset),
    asOf: new Date().toISOString(),
    mode: "demo",
    sources: [
      { name: "Market data", status: "demo" },
      { name: "News & earnings", status: "demo" },
      { name: "Social sentiment", status: "demo" },
      { name: "Prediction markets", status: "demo" },
    ],
    news: [
      {
        title: `${asset.short} outlook strengthens as institutional interest grows`,
        source: "Demo · Market briefing",
        sentiment: "Positive",
        time: "12m",
        url: null,
      },
      {
        title:
          "AI infrastructure investment remains a focus for the coming quarter",
        source: "Demo · Sector research",
        sentiment: "Positive",
        time: "38m",
        url: null,
      },
      {
        title:
          "Investors weigh growth expectations against elevated valuations",
        source: "Demo · Desk research",
        sentiment: "Neutral",
        time: "1h",
        url: null,
      },
    ],
    earnings: {
      period: "Illustrative next quarter",
      epsActual: 0.81,
      epsEstimate: 0.75,
      surprisePercent: 8.0,
    },
    social: {
      score: 72,
      bullish: 72,
      bearish: 18,
      neutral: 10,
      mentions: 12840,
      source: "Synthetic sentiment sample",
    },
    predictions: assets.filter((a) => a.type === "prediction"),
    warnings: [],
  };
}
async function json(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!response.ok)
    throw new Error(`Provider returned HTTP ${response.status}`);
  return response.json();
}
const polymarketBase = () =>
  process.env.POLYMARKET_BASE_URL || "https://gamma-api.polymarket.com";
export function parsePrediction(m) {
  const outcomes =
    typeof m.outcomes === "string" ? JSON.parse(m.outcomes) : m.outcomes;
  const prices =
    typeof m.outcomePrices === "string"
      ? JSON.parse(m.outcomePrices)
      : m.outcomePrices;
  if (
    !Array.isArray(outcomes) ||
    !Array.isArray(prices) ||
    outcomes.length !== 2 ||
    !outcomes.some((o) => String(o).toLowerCase() === "no")
  )
    throw Error("Unsupported prediction outcomes");
  const yes = outcomes.findIndex((o) => String(o).toLowerCase() === "yes");
  const price = Number(prices[yes]);
  if (
    yes < 0 ||
    prices[yes] == null ||
    !Number.isFinite(price) ||
    price < 0 ||
    price > 1 ||
    !/^\d+$/.test(String(m.id))
  )
    throw Error("Invalid prediction price");
  const asOf = Date.parse(m.updatedAt);
  if (!Number.isFinite(asOf) || asOf > Date.now() + 60000)
    throw Error("Invalid prediction timestamp");
  return {
    symbol: `PM-${m.id}`,
    name: m.question,
    short: m.question,
    price,
    type: "prediction",
    sector: "Polymarket",
    color: "#7655de",
    change: 0,
    asOf: new Date(asOf).toISOString(),
    tradable:
      !!m.active &&
      !m.closed &&
      m.acceptingOrders !== false &&
      price > 0 &&
      price < 0.99,
  };
}
let predictionCache = null;
export async function predictionMarkets() {
  const base = polymarketBase();
  if (predictionCache?.base === base && Date.now() - predictionCache.at < 60000)
    return predictionCache.markets;
  const rows = await json(
    `${base}/markets?active=true&closed=false&limit=20&order=volume24hr&ascending=false`,
  );
  if (!Array.isArray(rows)) throw Error("Invalid prediction market feed");
  const markets = rows
    .flatMap((m) => {
      try {
        const parsed = parsePrediction(m);
        return parsed.tradable ? [parsed] : [];
      } catch {
        return [];
      }
    })
    .slice(0, 8);
  predictionCache = { base, at: Date.now(), markets };
  return markets;
}
export async function marketContext(symbol) {
  if (process.env.DATA_MODE !== "live") return demoContext(symbol);
  let base = assets.find((a) => a.symbol === symbol);
  let contract = null;
  if (/^PM-\d+$/.test(symbol)) {
    contract = await json(`${polymarketBase()}/markets/${symbol.slice(3)}`);
    base = parsePrediction(contract);
    if (base.symbol !== symbol)
      throw Error("Prediction provider returned a different contract");
  }
  if (!base) throw new Error("Unknown asset");
  if (base.type === "prediction" && !contract)
    throw Error(
      "Example contracts are available in demo mode only. Choose a live Polymarket contract.",
    );
  const context = {
    asset: { ...base },
    candles: [],
    asOf: new Date().toISOString(),
    mode: "live",
    sources: [],
    news: [],
    earnings: null,
    social: null,
    predictions: [],
    warnings: [],
  };
  const finnhub = (path) =>
    json(
      `${process.env.FINNHUB_BASE_URL || "https://finnhub.io/api/v1"}/${path}${path.includes("?") ? "&" : "?"}token=${encodeURIComponent(process.env.FINNHUB_API_KEY || "")}`,
    );
  if (base.type === "stock") {
    if (!process.env.FINNHUB_API_KEY)
      throw new Error(
        "Live stock data requires FINNHUB_API_KEY. Set DATA_MODE=demo to explore without keys.",
      );
    const q = await finnhub(`quote?symbol=${symbol}`);
    if (
      !Number.isFinite(q.c) ||
      !(q.c > 0) ||
      !Number.isFinite(q.dp) ||
      !Number.isFinite(q.t) ||
      q.t * 1000 > Date.now() + 60000 ||
      Date.now() - q.t * 1000 > 4 * 86400000
    )
      throw new Error(
        "Market quote is unavailable or older than four days. No analysis or order was created.",
      );
    context.asset.price = q.c;
    context.asset.change = q.dp;
    context.asOf = new Date(q.t * 1000).toISOString();
    context.sources.push({ name: "Market data", status: "Finnhub" });
    const to = new Date().toISOString().slice(0, 10),
      from = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    await Promise.all([
      (async () => {
        try {
          const n = await finnhub(
            `company-news?symbol=${symbol}&from=${from}&to=${to}`,
          );
          if (!Array.isArray(n)) throw Error();
          context.news = n.slice(0, 6).map((x) => ({
            title: x.headline,
            source: x.source,
            time: new Date(x.datetime * 1000).toLocaleDateString("en-US"),
            url: x.url,
            sentiment: "Unscored",
          }));
          context.sources.push({ name: "News", status: "Finnhub" });
        } catch {
          context.warnings.push("News unavailable");
        }
      })(),
      (async () => {
        try {
          const e = await finnhub(`stock/earnings?symbol=${symbol}&limit=1`);
          context.earnings = e[0] || null;
          context.sources.push({
            name: "Earnings",
            status: context.earnings ? "Finnhub" : "unavailable",
          });
        } catch {
          context.warnings.push("Earnings unavailable");
        }
      })(),
    ]);
  }
  try {
    context.predictions = await predictionMarkets();
    context.sources.push({ name: "Prediction markets", status: "Polymarket" });
  } catch {
    context.warnings.push("Prediction markets unavailable");
  }
  if (contract) {
    context.asOf = base.asOf;
    context.contract = {
      description: String(contract.description || "").slice(0, 6000),
      endDate: contract.endDate,
      resolutionSource: contract.resolutionSource,
    };
    context.news = [
      {
        title: base.name,
        source: "Polymarket · Contract rules",
        time: "Market context",
        sentiment: "Unscored",
        url: `https://polymarket.com/event/${encodeURIComponent(contract.slug || "")}`,
      },
    ];
    context.sources.push({
      name: "Contract price & rules",
      status: "Polymarket",
    });
    context.warnings.push(
      "Company earnings do not apply to this contract. General news is not configured for prediction markets.",
    );
    if (!base.tradable)
      context.warnings.push(
        "This contract is closed or unavailable for new entries.",
      );
  }
  if (process.env.SOCIAL_SENTIMENT_URL) {
    try {
      const s = await json(
        `${process.env.SOCIAL_SENTIMENT_URL}${process.env.SOCIAL_SENTIMENT_URL.includes("?") ? "&" : "?"}symbol=${symbol}`,
      );
      if (!Number.isFinite(s.score) || s.score < 0 || s.score > 100)
        throw Error();
      context.social = s;
      context.sources.push({ name: "Social sentiment", status: "custom feed" });
    } catch {
      context.warnings.push("Social sentiment unavailable");
    }
  } else context.warnings.push("Social sentiment feed is not configured");
  return context;
}
