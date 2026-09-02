// Preflight — one-command demo runner for a silent (Bandicam) recording.
// Fully OFFLINE: replays the real captured BNBUSDT snapshot, no MCP, no LLM,
// no keys. Press record, run `node scripts/demo.mjs`, stop when it ends.
import { runEvidenceFromSnapshot } from '../src/evidence/pipeline.mjs';
import { explain } from '../src/explain/explainer.mjs';
import { defaultFixture, snapshotFor } from '../src/ingest/replay.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LINE = '─'.repeat(72);

function banner(title) {
  const pad = Math.max(0, Math.floor((72 - title.length) / 2));
  console.log(`\n${LINE}\n${' '.repeat(pad)}${title}\n${LINE}`);
}
function kv(k, v) { console.log(`  ${k.padEnd(22)} ${v}`); }

/** Print one idea->brief->explanation block against a fixture snapshot. */
async function showCase(title, pause, { ideaText, symbol, market, direction }) {
  banner(title);
  console.log(`\n  USER: "${ideaText}"`);
  await sleep(pause);

  const bundle = defaultFixture();
  const snap = snapshotFor(bundle, market);
  if (snap.symbol !== symbol + 'USDT') {
    console.log(`\n  (no ${market}/${symbol} fixture yet — skipping; capture with: node scripts/capture-snapshot.mjs ${symbol} --only ${market})`);
    return;
  }
  const brief = runEvidenceFromSnapshot({ idea: { symbol: symbol + 'USDT', market, direction }, snapshot: snap });
  await sleep(pause);

  console.log(`\n  → Extracted idea : ${symbol} · ${direction.toUpperCase()} · ${market}`);
  await sleep(pause);
  console.log('  → Evidence (computed in code from the real snapshot):');
  for (const e of brief.evidence) {
    const tag = e.supports_claim === null ? (e.tone ? `activity ${e.tone}` : 'neutral') : e.supports_claim ? 'supports' : 'contradicts';
    console.log(`      • ${e.metric.padEnd(22)} ${e.result.padEnd(30)} ${tag}`);
  }
  await sleep(pause);
  console.log(`  → verdict: ${brief.verdict}`);
  console.log(`  → confidence: ${brief.confidence}  (computed by code — not guessed)`);
  console.log(`  → contradiction: ${brief.contradiction.flag ? 'FLAGGED' : 'none'} ${brief.contradiction.detail ? '— ' + brief.contradiction.detail : ''}`);

  const note = await explain(brief, { mode: 'template' });
  await sleep(pause);
  console.log('\n  EXPLANATION (deterministic template — no LLM, no API key):');
  console.log('  ' + note.text.split('\n').join('\n  '));
  await sleep(pause);
}

const cases = [
  {
    title: '1 · A risky idea — evidence says DON\'T',
    pause: 2600,
    ideaText: 'Thinking about buying BNB here, feels like it is breaking out.',
    symbol: 'BNB', market: 'spot', direction: 'buy',
  },
  {
    title: '2 · A short idea — evidence is MIXED',
    pause: 2400,
    ideaText: 'Shorting BNBUSDT perpetual, looks weak.',
    symbol: 'BNB', market: 'futures_usds', direction: 'sell',
  },
];

const run = async () => {
  banner('P R E F L I G H T');
  console.log('  Evidence-based briefs BEFORE an agent acts on a trade idea.\n');
  console.log('  Deterministic math in code  ·  Binance market data (via Agent OS MCP)  ·  No LLM, no API key.');
  console.log('  Replaying a REAL captured BNBUSDT snapshot — fully offline.');
  await sleep(3200);

  for (const c of cases) await showCase(c.title, c.pause, c);

  banner('3 · The engine is tested against real data');
  console.log('\n  Running the test suite (deterministic — every run, same result):');
  await sleep(1800);
  const { execSync } = await import('node:child_process');
  try {
    const out = execSync('npm test', { cwd: new URL('..', import.meta.url), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const summary = out.split('\n').filter((l) => /pass|fail|tests|duration_ms/.test(l)).slice(-4).join('\n');
    console.log('\n  ' + summary.split('\n').map((l) => l.trim().startsWith('✔') || l.includes('pass') || l.includes('fail') ? l.trim() : l.trim()).filter(Boolean).join('\n  '));
  } catch (err) { console.log('\n  test run output captured:', err.stdout ? String(err.stdout).split('\n').slice(-6).join('\n  ') : err.message); }

  banner('That\'s Preflight');
  console.log('\n  Before the agent executes: get the evidence.\n  If it flags a contradiction, the trade waits.\n');
  await sleep(600);
};

run();
