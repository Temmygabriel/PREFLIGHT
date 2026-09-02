// Full Day-3 pipeline demo: a trade idea sentence → structured idea → evidence
// brief (replay by default) → plain-language explanation.
// Usage:
//   node scripts/idea.mjs "Thinking about buying BNB here, breaking out" [--llm] [--live]
import { extractTradeIdea } from '../src/explain/extractor.mjs';
import { explain } from '../src/explain/explainer.mjs';
import { runEvidenceFromSnapshot } from '../src/evidence/pipeline.mjs';
import { defaultFixture, snapshotFor } from '../src/ingest/replay.mjs';
import { fetchMarketSnapshot } from '../src/ingest/live.mjs';

const text = process.argv.slice(2).filter((a) => !a.startsWith('--')).join(' ') || 'Buying BNB here, breaking out';
const live = process.argv.includes('--live');
const llm = process.argv.includes('--llm');

const idea = extractTradeIdea(text);
console.log(`idea text : "${text}"`);
console.log(`extracted : symbol=${idea.symbol ?? '(none)'} direction=${idea.direction ?? '(none)'} market=${idea.market ?? '(none)'}`);
if (!idea.symbol || !idea.direction) {
  console.error('\nCould not determine symbol/direction. Try e.g. "buying BNB", "short ETHUSDT perpetual".');
  process.exit(1);
}
const market = idea.market || 'spot';
const symbol = idea.symbol + 'USDT';

let brief;
if (live) {
  const snap = await fetchMarketSnapshot({ symbol, market });
  brief = runEvidenceFromSnapshot({ idea: { symbol, market, direction: idea.direction }, snapshot: snap });
} else {
  const bundle = defaultFixture();
  let snap;
  try { snap = snapshotFor(bundle, market); } catch {
    // fall back to whichever snapshot the fixture holds for the same market
    const alt = bundle.snapshots.find((s) => s.market === market);
    snap = alt || bundle.snapshots[0];
  }
  if (snap.symbol !== symbol) {
    const have = bundle.snapshots.map((s) => `${s.market}/${s.symbol}`).join(', ');
    console.error(`\nNo ${market} fixture for ${symbol}. Have: ${have}. Capture one: node scripts/capture-snapshot.mjs ${idea.symbol} --only ${market}`);
    process.exit(1);
  }
  brief = runEvidenceFromSnapshot({ idea: { symbol, market, direction: idea.direction }, snapshot: snap });
}

console.log(`\n--- EVIDENCE BRIEF (${market}) ---`);
for (const e of brief.evidence) {
  const tag = e.supports_claim === null ? (e.tone ? `[${e.tone}]` : '[neutral]') : e.supports_claim ? '[supports]' : '[contradicts]';
  console.log(`  • ${e.metric.padEnd(24)} ${e.result.padEnd(34)} ${tag}`);
}
console.log(`verdict: ${brief.verdict} · confidence: ${brief.confidence} · contradiction: ${brief.contradiction.flag ? 'FLAGGED' : 'none'}`);
if (brief.contradiction.detail) console.log(`  ↳ ${brief.contradiction.detail}`);

const explanation = await explain(brief, { mode: llm ? 'llm' : 'auto' });
console.log(`\n--- EXPLANATION (${explanation.mode})${explanation.model ? ' · ' + explanation.model : ''} ---`);
if (explanation.error) console.log(`(LLM unavailable, used template: ${explanation.error})`);
console.log(explanation.text);
