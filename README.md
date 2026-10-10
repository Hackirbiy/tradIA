# tradIA

A local AI research desk for **paper trading stocks and prediction markets**. Five specialist analysts build and challenge a thesis, a judge makes the call, and a deterministic risk manager controls the virtual position. No brokerage SDK, real order route, or real-money execution exists.

## Run locally

Requires **Node.js 24+** and npm.

```bash
npm install
cp .env.example .env
npm run dev
```

Open **http://localhost:3000**. Without keys, the app runs end to end with synthetic market inputs and a clearly labeled simulated debate. Select a market, click **Run analysis**, inspect the debate and risk assessment, then **Create paper trade**. Portfolio, analysis history, and closed trades persist across server restarts.

For a production build:

```bash
npm run build
npm start
```

This is a single-user local app without authentication. Keep it on a trusted local network; add authentication and TLS before exposing it publicly. The server binds to `0.0.0.0` for local/container previews.

## Connect an AI model

Set these in `.env`, then restart:

```dotenv
OPENAI_API_KEY=your-api-key
OPENAI_MODEL=gpt-4.1-mini
DATA_MODE=demo
```

An API key enables genuine separate model calls, even with demo market data. Each run uses **six requests**: market analyst, fundamental analyst, bull, bear, neutral, and judge. The first three run concurrently. The bear reads their reports, the neutral analyst reads the debate, and the judge reads all five. Keys never go to the browser. The model is configurable; your account must have access to the selected model. Confidence is subjective conviction, not an empirically calibrated success probability.

Uses the [Responses API with structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs). The default [GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini) supports structured outputs and can be replaced via `OPENAI_MODEL`. Model refusals, malformed output, and provider errors fail the run without creating an executable analysis. News and supplied text are treated as untrusted evidence by the model instructions.

## Data sources

| Input             | Demo mode                                                        | Live mode                                               |
| ----------------- | ---------------------------------------------------------------- | ------------------------------------------------------- |
| Stock quote       | Fixed illustrative prices                                        | Finnhub `/quote`                                        |
| Chart             | Synthetic OHLC; range buttons reframe/aggregate the illustration | Explicitly unavailable (no synthetic chart substituted) |
| Company news      | Labeled sample headlines                                         | Finnhub `/company-news`                                 |
| Earnings          | Synthetic EPS example                                            | Finnhub `/stock/earnings`                               |
| Social sentiment  | Synthetic sentiment fixture                                      | Optional `SOCIAL_SENTIMENT_URL`                         |
| Prediction prices | Three tradable sample YES contracts                              | Polymarket Gamma `/markets` and `/markets/{id}`         |

To use current stock research:

```dotenv
DATA_MODE=live
FINNHUB_API_KEY=your-finnhub-key
OPENAI_API_KEY=your-openai-key
DATA_DIR=.data-live
```

Use a separate ledger for each data mode; the server refuses to mix a demo ledger with live quotes. Quotes are required. Missing optional sources are shown in **View all research sources**, and the model is told about the gaps. With live data but no AI key, the desk returns HOLD rather than fabricating an analysis. News provider limits and plan access may affect availability. Watchlist cards show fixed reference prices; opening a stock fetches its actual live quote.

**Prediction scope:** both the sample contracts in demo mode and active binary Polymarket YES contracts in live mode can be paper traded. Live contracts appear in Markets → Predictions, with provider prices, timestamps, and resolution rules supplied to the model. No Polymarket credentials are required for its public data; only the AI key is needed for its analysis. Closed contracts and prices at/above $0.99 cannot open new positions. Automated settlement and short/NO positions are not implemented. Stock orders are long-only. SELL/HOLD recommendations never open positions; existing positions can be closed manually.

### Optional social feed

`SOCIAL_SENTIMENT_URL` must be an HTTP(S) endpoint returning JSON for `?symbol=NVDA` (or `&symbol=NVDA` when it already has query parameters):

```json
{
  "score": 72,
  "bullish": 72,
  "bearish": 18,
  "neutral": 10,
  "mentions": 12840,
  "source": "My social feed"
}
```

`score` must be a finite number between 0 and 100. No social platform credentials or content scraping is built in. An unconfigured or failed feed is marked unavailable.

## Risk and paper execution

- $100,000 starting virtual capital; max **10%** allocation per asset, **1%** risk budget per order.
- Minimum **65%** confidence, one open position per asset, one fill per analysis, no leverage.
- Stock stop at **3.5%** below entry, target at **8.75%** above entry. Prediction contracts are sized against **total capital loss**, with a 15% stop and a target capped at $0.99.
- A **5% loss from starting capital** halts new orders and closes remaining positions at observed marks. It cannot be resumed if equity remains at/below the loss threshold.
- Emergency cutoff is persisted and closes positions at their last observed marks. Resume is available in Settings when equity permits.
- A trade requires a saved analysis from the last 15 minutes. The server independently refetches the quote, recalculates size, checks cash and limits, and fills the paper ledger. Live execution requires a quote at most 15 minutes old.
- Open positions are marked every 60 seconds while the server runs. The dashboard refreshes the ledger every 30 seconds. Stops/targets fill at the observed quote, including gaps, so loss can exceed the nominal stop or 5% threshold.
- No background protection runs while the server is stopped. A provider outage preserves the last observed mark, never substitutes a quote, and may delay stop processing. No commissions, slippage model, dividends, splits, or prediction settlement engine are included.

The cutoff is a hard execution gate, not a guarantee about market losses. Data persistence uses atomic JSON file replacement; run one server process per ledger. Analyses retain the last 200 calls; closed trades are kept. Local data lives in `.data/desk.json` (gitignored), configurable with `DATA_DIR`. Back it up to keep history. To reset virtual capital, stop the server and move that directory aside.

## Architecture

```text
Market + news + earnings + social + prediction data
                         ↓
          Market analyst · Fundamental analyst · Bull
                         ↓
                  Bear challenges the thesis
                         ↓
                  Neutral weighs the debate
                         ↓
                 Judge → BUY / SELL / HOLD
                         ↓
       Deterministic risk manager → paper ledger only
```

- `src/main.jsx`, `src/styles.css`: React research dashboard, portfolio, history, market explorer, and settings.
- `server/data.js`: data adapters and synthetic fixtures, provenance and source warnings.
- `server/agents.js`: sequential debate and JSON schema validation.
- `server/risk.js`: risk sizing, stop/target processing and account cutoff.
- `server/store.js`: local atomic persistence.
- `server/index.js`: Express APIs, server checks, quote monitoring and Vite/static serving.

`OPENAI_BASE_URL`, `FINNHUB_BASE_URL`, and `POLYMARKET_BASE_URL` allow process-local endpoint overrides for compatible test servers. Never use real credentials with a local emulator.

## Verify

```bash
npm test
npm run build
```

Tests cover allocation/risk budgets, binary contract loss exposure, cutoff and confidence gates, stop gaps, profit exits, persistence, and API order integrity. Demo prices are static by design, so simulated P&L remains flat until a test/live quote changes. Demo output is an explorable scenario, not a backtest or performance claim.
