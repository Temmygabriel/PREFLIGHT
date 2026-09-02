# Binance Agent OS MCP — Verified Capabilities

> **Status: VERIFIED via a live, authenticated connection on 2026-09-02 (Day 1).**
> Method: direct MCP client (Node 24, global `fetch`) speaking JSON-RPC 2.0 over
> Streamable HTTP, carrying the OAuth 2.0 bearer token issued by `claude mcp login`.
> Nothing in this file is assumed from Binance's marketing docs — every tool and
> schema below was returned by the server and exercised with a real call.

---

## 1. Connection facts (verified)

| Fact | Value |
|---|---|
| Endpoint | `https://agent.binance.com/mcp/agentic` |
| Transport | MCP Streamable HTTP (`Accept: application/json, text/event-stream`) |
| Auth | OAuth 2.0 (public client, PKCE S256, `authorization_code`). Required **even for `initialize`** — raw POSTs without a token return `401`. Token issued via `claude mcp login` / `accounts.binance.com/agentic-oauth`. |
| Server identity | `Tesla-MCP-Server` v`1.0.0` |
| Negotiated protocol | `2025-06-18` |
| Server capabilities | `tools`, `resources` |
| Direct `tools/call` | ✅ Works for every tool tested below — META-mode `tool_execute` is **not** required from a direct client. |

Note: the plan's §1 statement that market data needs "no auth" is true only for the
*scope*; reaching the server at all requires the OAuth login above.

---

## 2. Tool exposure model (verified)

The server does **not** return its full tool inventory in one `tools/list`.

- `tools/list` returns a default page of **50 tools**, namespaced:
  `analysis`(1), `convert`(9), `futures_coin`(12), `futures_usds`(12),
  `margin`(9), `spot`(5), plus two meta tools `tool_search` and `tool_execute`.
- `tool_search` (a callable tool) searches the tool surface **by category** and
  returns `{ tools, nextCursor }` (paginated). Categories returned by the server:
  `account, ai-analysis, asset, asset-management, borrow-repay, capital, convert,
  general, market, market-data, others, portfolio-margin-endpoints, trade,
  transfer, travel-rule`.
- Verified page sizes per category (single tool can appear in several categories):
  market-data 75 · account 60 · trade 47 · market 15 · asset 10 · travel-rule 9 ·
  general 4 · convert 2 · ai-analysis 1 · asset-management 1 ·
  borrow-repay 5 · capital 7 · others 2 · portfolio-margin-endpoints 1.
- Observed category annotations on spot tools: **`Data Source: Memory`**
  (`spot.depth`, `spot.exchangeInfo`, `spot.avgPrice`, `spot.getTrades`,
  `spot.ticker` family) vs **`Data Source: Database`** on others
  (`spot.aggTrades`, `spot.historicalBlockTrades`).

**Takeaway for Preflight:** market data for both spot and USDⓈ-M futures is fully
present and directly callable. Account/trade/wallet/convert/margin tools also exist
but are outside the MVP scope and are **not** exercised here (see §6).

---

## 3. Market-data tools Preflight uses (verified schemas + live results)

All reads below were executed live against `BNBUSDT` on **2026-09-02T13:18:34Z**,
HTTP 200. Full raw responses are captured in the replay fixture:
`fixtures/bnbusdt-snapshot-2026-09-02T13Z.json`.

### Spot (category: `market`)

**`spot.ticker24hr`** — 24hr price-change statistics
- Schema: `symbol` *or* `symbols` (one required); `type` = `FULL`|`MINI`; `symbolStatus`.
- Live (FULL, BNBUSDT): `lastPrice 683.90000000`, `openPrice 685.61…`,
  `priceChange -1.71000000`, `priceChangePercent -0.249`, `highPrice …`,
  `lowPrice …`, `volume …`, `quoteVolume …`.
- Supplies Preflight's **price-move** evidence (lastPrice vs openPrice ≈ price 24h ago).

**`spot.klines`** — candlestick bars
- Schema: `symbol`*, `interval`* (`1s,1m,3m,5m,15m,30m,1h,2h,4h,6h,8h,12h,1d,3d,1w,1M`),
  `startTime`, `endTime`, `timeZone` (default UTC), `limit`.
- Response: array of bar arrays `[openTime, open, high, low, close, volume,
  closeTime, quoteVolume, numTrades, takerBuyBase, takerBuyQuote, ignore]` (12 fields).
- Supplies Preflight's **volume-vs-baseline** evidence (last 1h bar volume vs mean of
  prior 24 1h bars) and an independent 24h price reference.

**`spot.depth`** — order book
- Schema: `symbol`*, `limit` (≤ 5000), `symbolStatus`.
- Response: `{ lastUpdateId, bids:[[price,qty],…], asks:[[price,qty],…] }`.
- Supplies Preflight's **order-book imbalance** evidence (top-20 sums, both sides).

### USDⓈ-M futures (category: `market-data`)

**`futures_usds.ticker24hrPriceChangeStatistics`**
- Schema: `symbol`.
- Live (BNBUSDT): `lastPrice 684.310`, `openPrice 686.100`, `priceChange -1.790`,
  `priceChangePercent -0.261`, `highPrice 690.030`, `lowPrice 675.000`,
  `quoteVolume 255132176.732`.

**`futures_usds.klineCandlestickData`**
- Schema: `symbol`*, `interval`* (`1m…1M`), `startTime`, `endTime`, `limit`.
- Response: bar arrays in the same 12-field layout as spot.klines.

**`futures_usds.orderBook`**
- Schema: `symbol`*, `limit` ∈ {5,10,20,50,100,500,1000}.
- Response: `{ lastUpdateId, E, T, bids, asks }` (`[[price,qty],…]`).

**`futures_usds.getFundingRateHistory`**
- Schema: `symbol`, `startTime`, `endTime`, `limit`.
- Response: `[{ symbol, fundingTime, fundingRate, markPrice, rateType }, …]`.
- Live (BNBUSDT, limit 5): latest settled funding ≈ `0.00000000` (0%), prior
  `0.00008422`. Supplies Preflight's **funding-rate** evidence (futures symbols only).

**`futures_usds.symbolPriceTicker`**
- Schema: `symbol`. Response: `{ symbol, price, time }`. Live: `684.310`.

### Funding-rate gotcha (verified — important)

`futures_usds.getFundingRateInfo` **ignores the `symbol` argument** and returns a
per-market *configuration* list (adjusted funding caps/floors, interval, disclaimer)
for every symbol — **not** the current rate. The actual rate is only in
**`getFundingRateHistory`** (settled funding events). Preflight must use the history
endpoint and take the entry with the max `fundingTime`.

---

## 4. Evidence-engine mapping (plan §3 → verified tool)

| Plan metric | Spot source | USDⓈ-M futures source |
|---|---|---|
| Price move (24h) | `spot.ticker24hr` (openPrice→lastPrice) | `futures_usds.ticker24hrPriceChangeStatistics` |
| Volume vs baseline | `spot.klines` (1h, limit 25) | `futures_usds.klineCandlestickData` (1h, limit 25) |
| Order-book imbalance | `spot.depth` (limit 20) | `futures_usds.orderBook` (limit 20) |
| Funding rate (futures only) | n/a | `futures_usds.getFundingRateHistory` (max fundingTime) |

All math stays in Preflight's code from the raw response fields — the server's own
`priceChangePercent` is available but we compute the plan's formula ourselves from
`openPrice`/`lastPrice` and from bar volumes, per the deterministic-math rule.

---

## 5. UNKNOWN / not exercised

- Account (read), Trade, Convert, Margin, Wallet/Transfer tools are **present** in
  the inventory but were **not** called — out of MVP scope. Their schemas exist but
  are unverified against real responses.
- `analysis.getTokenAiReport` exists (category `ai-analysis`) but returns an
  **AI-generated** report — excluded from Preflight evidence by design.
- `resources/list` was advertised by the server but no resource *content* was
  inspected (nothing Preflight needs; tool reads were sufficient).
- Whether the same market-data calls work for other symbols is expected (they are
  standard Binance market endpoints) but only `BNBUSDT` was exercised live.

---

## 6. Replay fixture

`fixtures/bnbusdt-snapshot-2026-09-02T13Z.json` holds the verified live responses
above (schema `preflight/replay-snapshot/1`, fields `observed_at`, `symbol`, `reads[]`
with `tool`, `args`, `data`). Replay mode replays this bundle through the identical
evidence pipeline when the live MCP is unreachable (judge network/DNS flakiness).
