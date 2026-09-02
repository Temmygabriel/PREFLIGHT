// Capture a live market snapshot bundle into fixtures/ for replay mode.
// Usage: node scripts/capture-snapshot.mjs [SYMBOL] [--only spot|futures_usds]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchMarketSnapshot } from '../src/ingest/live.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

const symbol = process.argv[2] || 'BNBUSDT';
const onlyIdx = process.argv.indexOf('--only');
const only = onlyIdx >= 0 ? process.argv[onlyIdx + 1] : null;
const markets = (only ? [only] : ['spot', 'futures_usds']).filter(Boolean);

const snapshots = [];
for (const market of markets) {
  process.stdout.write(`fetching ${symbol} ${market} …`);
  const snap = await fetchMarketSnapshot({ symbol, market });
  console.log(` done (${snap.observedAt})`);
  snapshots.push(snap);
}

const bundle = {
  schema: 'preflight/replay-snapshot/2',
  observedAt: new Date().toISOString(),
  note: `Live captures of ${symbol} from Binance Agent OS MCP (${markets.join(', ')}). Replay mode feeds these through the identical evidence pipeline.`,
  snapshots,
};

const dir = path.join(ROOT, 'fixtures');
fs.mkdirSync(dir, { recursive: true });
const out = path.join(dir, `${symbol.toLowerCase()}-market.json`);
fs.writeFileSync(out, JSON.stringify(bundle, null, 2));
console.log(`saved ${out} (${fs.statSync(out).size} bytes)`);
