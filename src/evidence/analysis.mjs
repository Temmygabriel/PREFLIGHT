// Analysis: turns normalized metric VALUES into evidence items with a
// direction-based agreement verdict, rule-based contradiction flags, and a
// deterministic confidence level. No LLM anywhere in this file.
//
// Voting model (documented so two runs always agree):
//   Directional votes (can agree / disagree / stay neutral):
//     - priceMove        | deadband |pct| <= 0.05  -> neutral
//     - orderBookImbal.  | deadband |imbalance| <= 0.05 -> neutral
//     - fundingRate      | neutral if within ±0.01% deadband (metrics.mjs)
//   Volume is NOT an independent directional vote: a ratio >= 1.5 is an
//   ACTIVITY signal shown in the brief ("volume spike"), never a contradiction.
import { classifyFundingRate, FUNDING_DEADBAND } from './metrics.mjs';

export const PRICE_DEADBAND_PCT = 0.05; // ±0.05% price move counts as "flat"
export const BOOK_DEADBAND = 0.05; // |imbalance| below this counts as balanced
export const VOLUME_SPIKE_RATIO = 1.5;

/** -1 sell/short (expect down), +1 buy/long (expect up). */
export function directionSign(direction) {
  const d = String(direction || '').toLowerCase();
  if (['buy', 'long'].includes(d)) return 1;
  if (['sell', 'short'].includes(d)) return -1;
  throw new Error(`direction must be buy/sell (got "${direction}")`);
}

function agreeSign(sign, dir) {
  return sign === dir ? 'agree' : 'disagree';
}

/**
 * Turn metric values + a direction into per-metric agreement plus a volume tone.
 * metricValues keys: priceMove{value}, volumeVsBaseline{value}, orderBookImbalance{value},
 * fundingRate (decimal number or null).
 */
export function evaluateEvidence(metricValues, direction) {
  const dir = directionSign(direction);
  const votes = [];
  const notes = [];

  if (metricValues.priceMove !== null && metricValues.priceMove !== undefined) {
    const { value: pct, calculation, result } = metricValues.priceMove;
    const stance = Math.abs(pct) <= PRICE_DEADBAND_PCT ? 'neutral' : agreeSign(Math.sign(pct), dir);
    votes.push({ metric: 'price_move_24h', stance, value: pct, sign: Math.sign(pct), calculation, result });
  }
  if (metricValues.orderBookImbalance !== null && metricValues.orderBookImbalance !== undefined) {
    const { value: imb, calculation, result } = metricValues.orderBookImbalance;
    const stance = Math.abs(imb) <= BOOK_DEADBAND ? 'neutral' : agreeSign(Math.sign(imb), dir);
    votes.push({ metric: 'order_book_imbalance', stance, value: imb, sign: Math.sign(imb), calculation, result });
  }
  if (metricValues.fundingRate !== null && metricValues.fundingRate !== undefined) {
    const cls = classifyFundingRate(metricValues.fundingRate);
    const stance = cls.classification === 'neutral' ? 'neutral' : agreeSign(cls.value > 0 ? 1 : -1, dir);
    votes.push({ metric: 'funding_rate', stance, value: cls.value, sign: cls.value > 0 ? 1 : -1, calculation: cls.calculation, result: cls.result });
  }
  if (metricValues.volumeVsBaseline !== null && metricValues.volumeVsBaseline !== undefined) {
    const { value: ratio, calculation, result } = metricValues.volumeVsBaseline;
    const tone = ratio >= VOLUME_SPIKE_RATIO ? 'spike' : ratio <= 1 / VOLUME_SPIKE_RATIO ? 'subdued' : 'normal';
    notes.push({ metric: 'volume_vs_baseline', value: ratio, tone, calculation, result });
  }

  return { votes, notes, direction: dir };
}

/** Rule-based contradiction flags across the votes. */
export function detectContradictions({ votes }) {
  const agrees = votes.filter((v) => v.stance === 'agree');
  const disagrees = votes.filter((v) => v.stance === 'disagree');
  const flag = disagrees.length > 0;
  return {
    flag,
    agrees: agrees.map((v) => v.metric),
    disagrees: disagrees.map((v) => v.metric),
    detail: !flag
      ? null
      : agrees.length
        ? `Mixed signals: ${agrees.map((v) => v.metric).join(', ')} point with the idea while ${disagrees.map((v) => v.metric).join(', ')} point against it`
        : `Evidence runs against the idea (${disagrees.map((v) => v.metric).join(', ')})`,
  };
}

/**
 * Deterministic confidence (plan §3):
 *  - High  : every directional vote agrees, none neutral, none contradicting.
 *  - Low   : majority of votes contradict the idea (or nothing agrees).
 *  - Medium: otherwise (majority agree but at least one neutral/contradiction).
 */
export function computeConfidence({ votes }) {
  const agree = votes.filter((v) => v.stance === 'agree').length;
  const neutral = votes.filter((v) => v.stance === 'neutral').length;
  const disagree = votes.filter((v) => v.stance === 'disagree').length;
  if (votes.length === 0) return { level: 'Low', agree, neutral, disagree, votes: votes.length };
  if (disagree === 0 && neutral === 0) return { level: 'High', agree, neutral, disagree, votes: votes.length };
  if (disagree >= agree) return { level: 'Low', agree, neutral, disagree, votes: votes.length };
  return { level: 'Medium', agree, neutral, disagree, votes: votes.length };
}

/** Plain-language verdict derived purely from the vote tallies. */
export function verdictFor({ votes }) {
  const agree = votes.filter((v) => v.stance === 'agree').length;
  const disagree = votes.filter((v) => v.stance === 'disagree').length;
  if (disagree === 0 && agree > 0) return 'evidence supports the idea';
  if (agree === 0 && disagree > 0) return 'evidence contradicts the idea';
  if (agree === 0 && disagree === 0) return 'insufficient directional signal';
  return 'evidence is mixed';
}

export { FUNDING_DEADBAND };
