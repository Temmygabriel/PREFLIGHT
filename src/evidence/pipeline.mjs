// Evidence pipeline: structured trade idea + market data in → brief object out.
//
//   idea {symbol, market:'spot'|'futures_usds', direction:'buy'|'sell', claim?}
//   data = normalized market (from live fetch or replay fixture)
//
// Output shape (plan §3/§6) is deterministic: numbers computed in code here,
// contradictions rule-based here, confidence computed here. Nothing here calls an LLM.
import { randomUUID } from 'node:crypto';
import {
  computePriceMove,
  computeVolumeVsBaseline,
  computeOrderBookImbalance,
} from './metrics.mjs';
import {
  directionSign,
  evaluateEvidence,
  detectContradictions,
  computeConfidence,
  verdictFor,
} from './analysis.mjs';
import { normalizeMarket } from '../ingest/normalize.mjs';

const SOURCE = 'binance_agent_os_mcp';

function humanDirection(dir) {
  return dir === 'buy' ? 'upside' : 'downside';
}

/**
 * Run the full evidence computation on a normalized `market` object.
 * `idea` = { symbol, market, direction, claim? }.
 */
export function runEvidence({ idea, market }) {
  const { symbol, market: mkt } = idea;
  const direction = String(idea.direction).toLowerCase();
  const dir = directionSign(direction);
  const claim = idea.claim || `${symbol} (${mkt}) ${direction} looks like a ${humanDirection(direction)} move`;

  // 1. Deterministic metric values
  const metricValues = {
    priceMove: computePriceMove({ currentPrice: market.priceNow, price24hAgo: market.price24hAgo }),
    volumeVsBaseline:
      market.oneHour && market.oneHour.baselineVolume
        ? computeVolumeVsBaseline({
            current1hVolume: market.oneHour.currentVolume,
            baseline1hVolume: market.oneHour.baselineVolume,
          })
        : null,
    orderBookImbalance: computeOrderBookImbalance({ bids: market.bids, asks: market.asks, levels: 20 }),
    fundingRate: market.fundingRate,
  };

  // 2. Agreement votes + volume tone (rule-based)
  const analysis = evaluateEvidence(metricValues, direction);

  // 3. Contradiction flags + confidence + verdict (all deterministic)
  const contradictions = detectContradictions(analysis);
  const confidence = computeConfidence(analysis);
  const verdict = verdictFor(analysis);

  // 4. Assemble evidence items in the plan §6 shape
  const briefId = randomUUID();
  const observedAt = market.observedAt || new Date().toISOString();
  const evidence = [];

  for (const v of analysis.votes) {
    evidence.push({
      id: randomUUID(),
      brief_id: briefId,
      claim,
      source: SOURCE,
      observed_at: observedAt,
      metric: v.metric,
      raw_value: v.value,
      calculation: v.calculation,
      result: v.result,
      supports_claim: v.stance === 'agree' ? true : v.stance === 'disagree' ? false : null,
    });
  }
  for (const n of analysis.notes) {
    evidence.push({
      id: randomUUID(),
      brief_id: briefId,
      claim,
      source: SOURCE,
      observed_at: observedAt,
      metric: n.metric,
      raw_value: n.value,
      calculation: n.calculation,
      result: n.result,
      supports_claim: null, // volume is an activity signal, not a directional vote
      tone: n.tone,
    });
  }

  return {
    id: briefId,
    claim,
    symbol,
    market: mkt,
    direction,
    observedAt,
    computedAt: new Date().toISOString(),
    evidence,
    contradiction: {
      flag: contradictions.flag,
      detail: contradictions.detail,
      agreeing: contradictions.agrees,
      disagreeing: contradictions.disagrees,
    },
    confidence: confidence.level,
    confidenceBreakdown: {
      votes: confidence.votes,
      agree: confidence.agree,
      neutral: confidence.neutral,
      disagree: confidence.disagree,
    },
    verdict,
  };
}

/**
 * Convenience: run from a raw snapshot {market, symbol, observedAt, reads}
 * (live.mjs output or a replay fixture snapshot). Use `marketOverride` when the
 * idea's market differs from the snapshot's label.
 */
export function runEvidenceFromSnapshot({ idea, snapshot, marketOverride }) {
  const mkt = marketOverride || snapshot.market;
  const market = normalizeMarket({ market: mkt, symbol: snapshot.symbol, reads: snapshot.reads, observedAt: snapshot.observedAt });
  return runEvidence({ idea: { ...idea, symbol: idea.symbol || snapshot.symbol, market: mkt }, market });
}

export { directionSign };
