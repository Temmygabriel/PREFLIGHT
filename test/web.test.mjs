// Web-core tests (offline). All run in replay mode — never touches the network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkIdea } from '../lib/checkIdea.mjs';

const replay = (text) => checkIdea(text, { mode: 'replay' });

test('web: buy BNB → replay brief contradicts, template explanation', async () => {
  const r = await replay('Buying BNB here, breaking out');
  assert.equal(r.ok, true);
  assert.equal(r.source, 'replay');
  assert.deepEqual(r.idea, { symbol: 'BNBUSDT', base: 'BNB', market: 'spot', marketLabel: 'spot', direction: 'buy' });
  assert.equal(r.brief.verdict, 'evidence contradicts the idea');
  assert.ok(r.brief.evidence.length >= 2);
  assert.equal(typeof r.explanation.text, 'string');
  assert.ok(r.explanation.text.includes(r.brief.confidence));
  // confidence is code-computed and labelled
  assert.equal(r.brief.confidence, 'Low');
});

test('web: short BNBUSDT perpetual → replay futures mixed + funding present', async () => {
  const r = await replay('Shorting BNBUSDT perpetual, looks weak');
  assert.equal(r.ok, true);
  assert.equal(r.brief.contradiction.flag, true);
  const metrics = r.brief.evidence.map((e) => e.metric);
  assert.ok(metrics.includes('funding_rate'));
});

test('web: gibberish → no_idea, never a guessed symbol', async () => {
  const r = await replay('the weather is nice today in berlin');
  assert.equal(r.ok, false);
  assert.equal(r.code, 'no_idea');
});

test('web: uncaptured symbol in replay → no_data with a hint', async () => {
  const r = await replay('Buying SOL now');
  assert.equal(r.ok, false);
  assert.equal(r.code, 'no_data');
  assert.ok(r.message.includes('SOLUSDT'));
});

test('web: same idea twice → identical verdict/confidence/evidence (deterministic)', async () => {
  const a = await replay('Buying BNB here, breaking out');
  const b = await replay('Buying BNB here, breaking out');
  const pick = (x) => JSON.stringify([x.brief.verdict, x.brief.confidence, x.brief.evidence.map((e) => [e.metric, e.result, e.support])]);
  assert.equal(pick(a), pick(b));
});
