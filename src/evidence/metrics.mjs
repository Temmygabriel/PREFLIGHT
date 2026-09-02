// Evidence metrics — pure, deterministic market math.
// Preflight rule #6: all calculations happen in code. The LLM only explains
// these pre-computed numbers; it never computes anything itself.
//
// Each metric returns a plain object of numbers + a human `result` string.
// None of these functions knows about a trade idea's direction — turning a
// metric into "supports / contradicts the claim" happens in the pipeline.

/** Trim a number to avoid float noise. */
const clean = (n) => Number(n.toFixed(8));

/**
 * Price move over 24h.
 * Formula (plan §3): (currentPrice - price24hAgo) / price24hAgo, as a percentage.
 */
export function computePriceMove({ currentPrice, price24hAgo }) {
  const p = Number(currentPrice);
  const a = Number(price24hAgo);
  if (!Number.isFinite(p) || !Number.isFinite(a) || a <= 0) return null;
  const pct = clean(((p - a) / a) * 100);
  return {
    value: pct, // percent, e.g. -0.249
    currentPrice: p,
    price24hAgo: a,
    calculation: '(current price - price 24h ago) / price 24h ago, expressed as %',
    result: `${pct >= 0 ? '+' : ''}${pct}% over 24h`,
  };
}

/**
 * Volume vs baseline.
 * Formula (plan §3): current 1h volume / average 1h volume over the trailing 24h,
 * expressed as a ratio (e.g. 2.3x baseline).
 * The caller decides which bar counts as "current"; this just does the math.
 */
export function computeVolumeVsBaseline({ current1hVolume, baseline1hVolume }) {
  const c = Number(current1hVolume);
  const b = Number(baseline1hVolume);
  if (!Number.isFinite(c) || !Number.isFinite(b) || b <= 0) return null;
  const ratio = clean(c / b);
  return {
    value: ratio,
    current1hVolume: c,
    baseline1hVolume: b,
    calculation: 'current 1h volume / average 1h volume over the trailing 24h',
    result: `${ratio}x baseline`,
  };
}

/**
 * Order-book imbalance over the top `levels` per side.
 * Formula (plan §3): (bidVolume - askVolume) / (bidVolume + askVolume), range -1..1.
 * Positive => buy side heavier.
 * bids/asks are [[price, quantity], ...] arrays as returned by the MCP.
 */
export function computeOrderBookImbalance({ bids = [], asks = [], levels = 20 }) {
  const bidVol = bids.slice(0, levels).reduce((s, l) => s + Number(l[1] || 0), 0);
  const askVol = asks.slice(0, levels).reduce((s, l) => s + Number(l[1] || 0), 0);
  const total = bidVol + askVol;
  if (total <= 0) return null;
  const imbalance = clean((bidVol - askVol) / total);
  return {
    value: imbalance,
    bidVolume: bidVol,
    askVolume: askVol,
    levels,
    calculation: `(bid volume - ask volume) / (bid volume + ask volume), top ${levels} levels each side`,
    result: imbalance >= 0 ? `buy-side heavier (+${imbalance})` : `sell-side heavier (${imbalance})`,
  };
}

/** Funding-rate deadband (±0.01% = ±0.0001 as a decimal), per plan §3. */
export const FUNDING_DEADBAND = 0.0001;

/**
 * Classify a funding rate (decimal, e.g. 0.00008422).
 * Plan §3: positive/negative/neutral using a small deadband (±0.01% counts as neutral).
 */
export function classifyFundingRate(rate) {
  const r = Number(rate);
  if (!Number.isFinite(r)) return null;
  const classification = r > FUNDING_DEADBAND ? 'positive' : r < -FUNDING_DEADBAND ? 'negative' : 'neutral';
  return {
    value: r,
    classification,
    deadband: FUNDING_DEADBAND,
    calculation: 'current funding rate as-is; neutral within ±0.01%',
    result: `${(r * 100).toFixed(4)}% (${classification})`,
  };
}
