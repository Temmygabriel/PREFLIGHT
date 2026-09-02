// Server-side snapshot store: replay fallback data, imported as ESM (no fs at
// request time). Populated from fixtures/*.json by scripts/build-snapdata.mjs.
import { snapshots } from '../data/snapshots.mjs';

/** Find a captured snapshot for a full symbol (e.g. BNBUSDT) + market. */
export function find(symbol, market) {
  return snapshots.find((s) => s.symbol === symbol && s.market === market) || null;
}

/** All captured snapshot labels (for UI hints). */
export function list() {
  return snapshots.map((s) => ({ symbol: s.symbol, market: s.market }));
}

/** Distinct base tokens we have replay data for (e.g. BNB). */
export function supportedBases() {
  const set = new Set();
  for (const s of snapshots) {
    const m = s.symbol.match(/^([A-Z0-9]+?)(USDT|USDC|FDUSD|BUSD|BTC|ETH)$/);
    if (m) set.add(m[1]);
  }
  return [...set];
}
