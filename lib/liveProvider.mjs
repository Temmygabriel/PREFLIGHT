// Live market data through the real Binance Agent OS MCP server.
// Serverless-safe: token comes from the PREFLIGHT_MCP_TOKEN env secret; every
// fetch is bounded by an AbortController so a hung read can't kill a function.
import { fetchMarketSnapshot } from '../src/ingest/live.mjs';
import { resolveToken } from '../src/ingest/mcpClient.mjs';

export function liveAvailable() {
  return Boolean(resolveToken());
}

/** Live snapshot {market, symbol, observedAt, reads}, or throws on any failure. */
export async function fetchLive({ symbol, market, timeoutMs = 9000 }) {
  if (!liveAvailable()) {
    const err = new Error('No MCP token configured (PREFLIGHT_MCP_TOKEN).');
    err.code = 'NO_TOKEN';
    throw err;
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetchMarketSnapshot({ symbol, market }, { signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}
