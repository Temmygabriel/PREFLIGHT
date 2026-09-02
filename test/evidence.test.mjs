// Deterministic evidence tests — asserted against the REAL captured BNBUSDT
// snapshot (fixtures/bnbusdt-market.json), not synthetic data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computePriceMove,
  computeVolumeVsBaseline,
  computeOrderBookImbalance,
  classifyFundingRate,
} from '../src/evidence/metrics.mjs';
import { runEvidenceFromSnapshot } from '../src/evidence/pipeline.mjs';
import { defaultFixture, snapshotFor } from '../src/ingest/replay.mjs';

const fixture = defaultFixture();
const spot = snapshotFor(fixture, 'spot');
const futures = snapshotFor(fixture, 'futures_usds');

const item = (brief, metric) => brief.evidence.find((e) => e.metric === metric);

// --- pure metric math -------------------------------------------------------
test('priceMove formula is exact', () => {
  const r = computePriceMove({ currentPrice: 100, price24hAgo: 110 });
  assert.ok(Math.abs(r.value - -9.09090909) < 1e-6);
  assert.equal(r.calculation.includes('24h'), true);
});

test('volumeVsBaseline ratio', () => {
  assert.equal(computeVolumeVsBaseline({ current1hVolume: 300, baseline1hVolume: 100 }).value, 3);
});

test('orderBookImbalance direction', () => {
  assert.equal(computeOrderBookImbalance({ bids: [['10', '5']], asks: [['10', '5']] }).value, 0);
  const buyHeavy = computeOrderBookImbalance({ bids: [['10', '8']], asks: [['10', '2']] });
  assert.ok(buyHeavy.value > 0);
});

test('funding classification deadband ±0.01%', () => {
  assert.equal(classifyFundingRate(0.00008422).classification, 'neutral'); // 0.0084% < 0.01%
  assert.equal(classifyFundingRate(0.0002).classification, 'positive');
  assert.equal(classifyFundingRate(-0.0002).classification, 'negative');
});

// --- pipeline on real data --------------------------------------------------
test('spot buy brief has priceMove ≈ Binance priceChangePercent', () => {
  const brief = runEvidenceFromSnapshot({ idea: { market: 'spot', direction: 'buy' }, snapshot: spot });
  const pm = item(brief, 'price_move_24h');
  assert.ok(pm, 'price_move_24h evidence present');
  // ticker priceChangePercent is server-computed; ours is the plan formula from the same raw fields
  const raw = spot.reads.spot_ticker24hr.data;
  const ticker = typeof raw === 'string' ? JSON.parse(raw) : raw;
  assert.ok(Math.abs(pm.raw_value - Number(ticker.priceChangePercent)) < 0.01,
    `ours ${pm.raw_value} vs server ${ticker.priceChangePercent}`);
  assert.ok(item(brief, 'order_book_imbalance'), 'book imbalance present');
  assert.ok(item(brief, 'volume_vs_baseline'), 'volume evidence present');
  assert.ok(['High', 'Medium', 'Low'].includes(brief.confidence));
  assert.equal(typeof brief.contradiction.flag, 'boolean');
  assert.ok(brief.verdict.length > 0);
});

test('futures brief includes funding; spot does not', () => {
  const fb = runEvidenceFromSnapshot({ idea: { market: 'futures_usds', direction: 'sell' }, snapshot: futures });
  const funding = item(fb, 'funding_rate');
  assert.ok(funding, 'funding evidence present for futures');
  assert.equal(typeof funding.raw_value, 'number');

  const sb = runEvidenceFromSnapshot({ idea: { market: 'spot', direction: 'buy' }, snapshot: spot });
  assert.equal(item(sb, 'funding_rate'), undefined);
});

test('runEvidence is deterministic (no LLM, no randomness in verdict)', () => {
  const a = runEvidenceFromSnapshot({ idea: { market: 'spot', direction: 'buy' }, snapshot: spot });
  const b = runEvidenceFromSnapshot({ idea: { market: 'spot', direction: 'buy' }, snapshot: spot });
  assert.equal(a.confidence, b.confidence);
  assert.equal(a.verdict, b.verdict);
  assert.deepEqual(a.evidence.map((e) => e.raw_value), b.evidence.map((e) => e.raw_value));
});

test('direction flips priceMove support on the same snapshot', () => {
  const buy = item(runEvidenceFromSnapshot({ idea: { market: 'spot', direction: 'buy' }, snapshot: spot }), 'price_move_24h');
  const sell = item(runEvidenceFromSnapshot({ idea: { market: 'spot', direction: 'sell' }, snapshot: spot }), 'price_move_24h');
  // non-null supports are exact complements of each other
  if (buy.supports_claim !== null && sell.supports_claim !== null) {
    assert.notEqual(buy.supports_claim, sell.supports_claim);
  }
  // and they can't both be null
  assert.ok(buy.supports_claim !== null || sell.supports_claim !== null);
});

test('replay bundle schema + snapshot shape', () => {
  assert.equal(fixture.schema, 'preflight/replay-snapshot/2');
  assert.ok(fixture.observedAt);
  for (const snap of fixture.snapshots) {
    assert.ok(['spot', 'futures_usds'].includes(snap.market));
    assert.ok(snap.reads && Object.keys(snap.reads).length >= 3);
  }
});
