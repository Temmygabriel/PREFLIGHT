// Day-2 demo runner: compute an evidence brief from the replay fixture (no live
// MCP needed) or live.
// Usage:
//   node scripts/run-brief.mjs spot buy BNBUSDT           (replay fixture, default)
//   node scripts/run-brief.mjs futures_usds sell BNBUSDT --live
import { runEvidenceFromSnapshot, runEvidence } from '../src/evidence/pipeline.mjs';
import { normalizeMarket } from '../src/ingest/normalize.mjs';
import { defaultFixture, snapshotFor } from '../src/ingest/replay.mjs';
import { fetchMarketSnapshot } from '../src/ingest/live.mjs';

const market = process.argv[2] || 'spot';
const direction = process.argv[3] || 'buy';
const symbol = process.argv[4] || 'BNBUSDT';
const live = process.argv.includes('--live');

let brief;
if (live) {
  const snap = await fetchMarketSnapshot({ symbol, market });
  brief = runEvidenceFromSnapshot({ idea: { symbol, market, direction }, snapshot: snap });
} else {
  const bundle = defaultFixture();
  const snap = snapshotFor(bundle, market);
  brief = runEvidenceFromSnapshot({ idea: { symbol: snap.symbol, market, direction }, snapshot: snap });
}

console.log(`\n${'='.repeat(64)}`);
console.log(`EVIDENCE BRIEF  ${brief.symbol}  [${brief.market}]  direction: ${brief.direction}`);
console.log(`observed ${brief.observedAt} · source ${brief.source ?? 'binance_agent_os_mcp'}`);
console.log(`${'='.repeat(64)}`);
console.log(`claim: ${brief.claim}`);
console.log(`VERDICT: ${brief.verdict.toUpperCase()}   CONFIDENCE: ${brief.confidence}`);
console.log(`confidence votes: ${brief.confidenceBreakdown.votes} (agree ${brief.confidenceBreakdown.agree}, neutral ${brief.confidenceBreakdown.neutral}, disagree ${brief.confidenceBreakdown.disagree})`);
console.log(`contradiction: ${brief.contradiction.flag ? 'FLAGGED' : 'none'}${brief.contradiction.detail ? ' — ' + brief.contradiction.detail : ''}`);
console.log(`\nevidence items:`);
for (const e of brief.evidence) {
  const support = e.supports_claim === null ? (e.tone ? `(activity: ${e.tone})` : '(neutral)') : e.supports_claim ? 'supports' : 'contradicts';
  console.log(`  • ${e.metric.padEnd(22)} ${String(e.result).padEnd(30)} ${support}`);
}
