// Replay loader: serve pre-captured market snapshots through the SAME normalize →
// metrics path as live mode, so a demo never depends on live MCP being reachable.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURE_DIR = fileURLToPath(new URL('../../fixtures/', import.meta.url));

/** Load a fixture file (any {schema, observedAt, snapshots:[{market,symbol,reads}]}). */
export function loadFixture(relPath) {
  const buf = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, relPath), 'utf8'));
  return buf;
}

/** Default local replay source. */
export function defaultFixture() {
  return loadFixture('bnbusdt-market.json');
}

/** Pick the snapshot for a given market out of a fixture bundle. */
export function snapshotFor(bundle, market) {
  const snap = (bundle.snapshots || []).find((s) => s.market === market);
  if (!snap) throw new Error(`No ${market} snapshot in fixture ${bundle.schema}`);
  return snap;
}
