# Preflight

Before you let an AI agent act on your Binance account, **Preflight** generates a short,
evidence-based brief on any trade idea — pulling real market data, running deterministic
math on it, flagging contradictions, and returning a plain-language verdict with a
confidence level computed in code. Your "confirm" click becomes an informed decision
instead of a leap of faith.

Built for the Binance Agent OS Mini Hackathon. Read-only MVP: consumes **Market data**
via the Binance Agent OS MCP server; no trading scope required.

> Status: Web app live on Vercel — type a trade idea, get a checklist + a verdict stamp
> (CLEARED / HOLD / GROUNDED / NO CLEARANCE) on an inspection docket. Live Binance
> Agent OS MCP reads when `PREFLIGHT_MCP_TOKEN` is set; automatic replay of real
> captured snapshots otherwise. Deterministic engine + tests; GitHub Actions CI +
> Vercel build on every push.

## The pitch (30 s)

Aviation does it before every takeoff: **run the checklist.** Preflight is the pre-flight
checklist for a trade — rendered as a physical inspection docket. State an idea
("Buying BNB") → it pulls the market and runs four deterministic checks —
**price trend, order book, volume, funding** → stamps **CLEARED / HOLD / GROUNDED**
and shows you exactly which evidence contradicted you. Every number is computed by
the engine; **no model decides or guesses.**

## Web app (deploy: Vercel)

```bash
npm install        # once (or let Vercel/CI do it in the cloud — keep local light)
npm run dev        # local dev at http://localhost:3000
npm test           # engine + web-core tests (node --test, offline)
```
Every push to `main` runs GitHub Actions (`npm test` + `npm run build`) and triggers a
Vercel preview build — no need to build Next locally.

- `app/` — Next.js UI (checklist + verdict-stamp identity).
- `app/api/check/route.js` → `lib/checkIdea.mjs` — one endpoint: idea text → evidence
  brief → explanation. Live first, replay fallback on any failure.
- Live reads need `PREFLIGHT_MCP_TOKEN` (set it as a Vercel env secret = your Binance
  MCP OAuth access token). Without it the site runs on replay snapshots and labels them
  honestly. No other keys. No LLM.

## CLI (engine, offline)

```bash
node scripts/idea.mjs "Shorting BNBUSDT perpetual"   # sentence → idea → brief → explanation
node scripts/run-brief.mjs spot buy BNB              # explicit market/direction/symbol
node scripts/capture-snapshot.mjs BNBUSDT --only spot # capture a new replay fixture
node scripts/demo.mjs                                # one-command silent-record demo
```

## Repo layout
- `src/` — deterministic evidence engine: ingest (MCP client, live, normalize, replay),
  evidence (metrics, analysis, pipeline), explain (extractor, explainer, llm-optional)
- `docs/mcp-capabilities.md` — verified inventory of live MCP tools/schemas
- `fixtures/` → `data/snapshots.mjs` — real market snapshots captured live (replay source)
- `lib/` — web server core (checkIdea, snapshotStore, liveProvider)
- `memory/` + `demo/` (local only, gitignored) — progress + silent-record kit

## Setup (verified)
```bash
claude mcp add binance-mcp-server --transport http https://agent.binance.com/mcp/agentic
claude mcp login binance-mcp-server   # interactive browser OAuth — required even for market data
```
See `docs/mcp-capabilities.md` for the verified tool inventory and schemas.

## License
MIT
