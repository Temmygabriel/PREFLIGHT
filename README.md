# Preflight

Before you let an AI agent act on your Binance account, **Preflight** generates a short,
evidence-based brief on any trade idea — pulling real market data, running deterministic
math on it, flagging contradictions, and returning a plain-language verdict with a
confidence level computed in code. Your "confirm" click becomes an informed decision
instead of a leap of faith.

Built for the Binance Agent OS Mini Hackathon. Read-only MVP: consumes **Market data**
via the Binance Agent OS MCP server; no trading scope required.

> Status: Day 1 — capability verification **complete**. Live market-data reads for spot + USDⓈ-M futures verified end-to-end; replay fixture captured.

## Repo layout
- `docs/mcp-capabilities.md` — verified inventory of live MCP tools/schemas
- `fixtures/` — real market snapshots captured live (replay mode source)
- `memory/` (local only, gitignored) — progress + standing context

## Setup (verified)
```bash
claude mcp add binance-mcp-server --transport http https://agent.binance.com/mcp/agentic
claude mcp login binance-mcp-server   # interactive browser OAuth — required even for market data
```
See `docs/mcp-capabilities.md` for the verified tool inventory and schemas.

## License
MIT
