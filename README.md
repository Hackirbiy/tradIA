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

## Aurum — poste XAUUSD (nouvelle interface)

L’entrée `/` ouvre désormais un dashboard XAUUSD en français. L’ancien desk et ses API restent dans le dépôt. Démarrage inchangé : `npm run dev`, port 3000.

- Six spécialistes D1, H1, M15, M5, M1 et corrélations DXY/taux US. Sans clé OpenAI, les votes et les explications sont un scénario fixe explicitement étiqueté. Avec une clé, six appels séparés analysent des chandeliers **synthétiques** ; les agents doivent signaler les données manquantes, notamment le calendrier et les corrélations.
- Juge déterministe à poids égaux : nombre de votes du côté majoritaire / 6. Égalité, seuil non atteint ou arrêt manuel = HOLD. La conviction des modèles ne pondère pas les votes et n’est pas une probabilité de réussite.
- Graphiques de démonstration M1/M5/M15/H1/D1, EMA 9/21 calculées pour l’affichage. Zones SMC et ATR M5 sont illustratifs, pas des indicateurs calculés à partir d’un flux broker.
- À la fin de chaque analyse, le juge exécute automatiquement un ordre virtuel BUY/SELL si la confluence atteint **75 % minimum (inclus)**, soit 5 votes sur 6 à poids égaux. Aucun clic de confirmation ; le seuil peut être renforcé mais pas abaissé sous 75 %. Les configurations précédentes sont relevées à 75 %. Il n’y a pas encore de boucle d’analyse continue : chaque cycle est lancé avec le bouton d’analyse. Les blocages sont enregistrés avec leur motif, sans exécution différée après reprise ou clôture.
- Ordres virtuels BUY/SELL : analyse de moins de 5 minutes, un seul ordre par analyse, une position à la fois, risque réglable de 0,1 à 2 %. Hypothèse de simulation : 100 onces par lot, pas de frais. Lots arrondis vers le bas au pas de 0,01. SL fixe illustratif de 4,80 USD (1,5 × ATR 3,20), objectif selon le R:R réglé. Le serveur recalcule et valide le plan.
- Journal et paramètres stockés séparément dans `DATA_DIR/xau.json`. Les cours restent fixes : clôtures manuelles à P&L nul, pas de déclenchement automatique SL/TP ni de surveillance du drawdown. Le coupe-circuit **manuel** bloque les nouvelles entrées sans fermer les positions existantes.
- **Pont MT4 disponible à installer** : la page MetaTrader 4 associe numéro de compte et serveur par une clé de transport. Le nouveau EA AurumBridge exporte les bougies et exécute les plans du juge, automatiquement à partir de 75 %. L’ancien AI Agent v12.8 doit être remplacé sur le graphique. Voir [le guide complet](mt4/README.md). La compilation et l’exécution broker restent à valider dans MT4 ; aucun terminal Windows n’est accessible depuis le sandbox. Le mot de passe broker reste dans MT4.

### Telegram privé

Configurer dans `.env` côté serveur (jamais dans le navigateur) :

```dotenv
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

Créer un bot avec BotFather, renseigner son token et votre identifiant de chat **privé**, redémarrer le serveur et envoyer `/start`, `/statut` ou `/juge`. Le bot n’accepte que ce chat et cet utilisateur et ignore les groupes. Il consulte le compte MT4 associé, ou la simulation si aucun compte n’est associé. `/stop` bloque les nouvelles entrées MT4 ; aucune commande d’ouverture ou d’armement n’est exposée. Poll toutes les 5 secondes ; les messages de plus de 60 secondes sont ignorés pour éviter la répétition au redémarrage. Un seul processus doit interroger le bot. Le serveur doit rester actif. Ne pas configurer de webhook sur ce même bot.

L’application reste locale et mono-utilisateur, sans authentification web. Les routes `/api/mt4` requièrent la clé du pont et le relais distant exige HTTPS. Les anciennes API de simulation restent sans authentification : ajouter un contrôle d’accès avant exposition publique de l’application entière.
