// Explainer + extractor tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractTradeIdea } from '../src/explain/extractor.mjs';
import { explainTemplate, buildFactSheet } from '../src/explain/explainer.mjs';
import { runEvidenceFromSnapshot } from '../src/evidence/pipeline.mjs';
import { defaultFixture, snapshotFor } from '../src/ingest/replay.mjs';

const spot = snapshotFor(defaultFixture(), 'spot');

// --- extractor --------------------------------------------------------------
test('extractor: buy BNB breaking out', () => {
  const r = extractTradeIdea('Thinking about buying BNB here, feels like it is breaking out');
  assert.equal(r.symbol, 'BNB');
  assert.equal(r.direction, 'buy');
});

test('extractor: short ETHUSDT perpetual', () => {
  const r = extractTradeIdea('Short ETHUSDT perpetual looks weak');
  assert.equal(r.symbol, 'ETH');
  assert.equal(r.direction, 'sell');
  assert.equal(r.market, 'futures_usds');
});

test('extractor: sell ADA spot', () => {
  const r = extractTradeIdea('Sell ADA on spot, looks overbought');
  assert.equal(r.symbol, 'ADA');
  assert.equal(r.market, 'spot');
});

test('extractor: spelled-out alt perp not in whitelist (HYPEUSDT) resolves', () => {
  const r = extractTradeIdea('Shorting HYPEUSDT perpetual feels like a good idea now');
  assert.equal(r.symbol, 'HYPE');
  assert.equal(r.direction, 'sell');
  assert.equal(r.market, 'futures_usds');
});

test('extractor: bare high-cap alt word (HYPE) resolves without a suffix', () => {
  const r = extractTradeIdea('hype is strong, buy it');
  assert.equal(r.symbol, 'HYPE');
  assert.equal(r.direction, 'buy');
});

test('extractor: gibberish yields null symbol (no hallucination)', () => {
  const r = extractTradeIdea('the weather is nice today in berlin');
  assert.equal(r.symbol, null);
});

// --- explainer template (no LLM) ----------------------------------------------
test('template explainer is deterministic and grounded in the brief', () => {
  const brief = runEvidenceFromSnapshot({ idea: { market: 'spot', direction: 'buy' }, snapshot: spot });
  const text = explainTemplate(brief);
  assert.equal(typeof text, 'string');
  assert.ok(text.includes(brief.symbol));
  assert.ok(text.includes(brief.confidence));
  assert.ok(text.includes(brief.verdict));
  // fact sheet must carry only structured fields
  const fs = buildFactSheet(brief);
  assert.ok(fs.evidence.length >= 2);
  for (const e of fs.evidence) {
    assert.ok(['metric', 'result', 'support'].every((k) => k in e));
  }
  // deterministic: same input → same output
  assert.equal(text, explainTemplate(brief));
});
