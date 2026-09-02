// Live loader: pull the reads Preflight needs for one (symbol, market) straight
// from the Binance Agent OS MCP server. Tools below are VERIFIED (docs/mcp-capabilities.md).
import { connect } from './mcpClient.mjs';

export const KLINE_LIMIT = 26; // 25 completed 1h bars expected after dropping the open bar

const READS = {
  spot: [
    ['spot_ticker24hr', 'spot.ticker24hr', { symbol: undefined, type: 'FULL' }],
    ['spot_klines', 'spot.klines', { symbol: undefined, interval: '1h', limit: KLINE_LIMIT }],
    ['spot_depth', 'spot.depth', { symbol: undefined, limit: 20 }],
  ],
  futures_usds: [
    ['futures_ticker24hr', 'futures_usds.ticker24hrPriceChangeStatistics', { symbol: undefined }],
    ['futures_klines', 'futures_usds.klineCandlestickData', { symbol: undefined, interval: '1h', limit: KLINE_LIMIT }],
    ['futures_orderbook', 'futures_usds.orderBook', { symbol: undefined, limit: 20 }],
    ['futures_funding', 'futures_usds.getFundingRateHistory', { symbol: undefined, limit: 10 }],
  ],
};

/** Fetch a live snapshot for a symbol + market. Returns { market, symbol, observedAt, reads }.
 *  opts.signal (AbortSignal) lets a caller time out in-flight MCP reads. */
export async function fetchMarketSnapshot({ symbol, market }, opts = {}) {
  const plan = READS[market];
  if (!plan) throw new Error(`Unsupported market "${market}" (use "spot" or "futures_usds").`);
  const client = await connect(opts);
  try {
    const observedAt = new Date().toISOString();
    const reads = {};
    for (const [key, tool, args] of plan) {
      const finalArgs = { ...args };
      if ('symbol' in finalArgs && finalArgs.symbol === undefined) finalArgs.symbol = symbol;
      const data = await client.callTool(tool, finalArgs);
      reads[key] = { tool, args: finalArgs, data };
    }
    return { market, symbol, observedAt, reads };
  } finally {
    await client.close().catch(() => {});
  }
}
