// Normalize raw MCP reads (or replay fixtures with the same shape) into one
// uniform "market" object that the deterministic metrics can consume.
// This is the ONLY place that knows the raw response shapes; metrics stay pure.

const asObj = (d) => (typeof d === 'string' ? JSON.parse(d) : d);
const asArr = (d) => (typeof d === 'string' ? JSON.parse(d) : Array.isArray(d) ? d : []);

/**
 * Resolve a "current 1h volume vs trailing 24h baseline" from a kline array.
 * Klines come oldest-first as [openTime, open, high, low, close, volume, closeTime, ...].
 * The still-forming (in-progress) bar is dropped (its closeTime is in the future),
 * the last completed bar is "current 1h", and the baseline is the mean volume of
 * the 24 completed bars before it. Deterministic and documented in code.
 */
export function resolveOneHourSeries(klines, now = Date.now()) {
  const bars = asArr(klines)
    .map((b) => ({ openTime: Number(b[0]), closeTime: Number(b[6]), volume: Number(b[5]) }))
    .filter((b) => Number.isFinite(b.closeTime) && Number.isFinite(b.volume) && b.closeTime <= now && b.volume > 0);
  if (bars.length < 2) return null;
  const current = bars[bars.length - 1];
  const prior = bars.slice(0, -1).slice(-24); // 24 completed bars before current
  const baselineVolume = prior.length ? prior.reduce((s, b) => s + b.volume, 0) / prior.length : null;
  return {
    currentVolume: current.volume,
    baselineVolume,
    completedBars: bars.length,
    trailingBars: prior.length,
    truncated: prior.length < 24, // true if we had fewer than 24 trailing bars
  };
}

/** Market-neutral normalize. `reads` uses stable keys (see live.mjs). */
export function normalizeMarket({ market, symbol, reads, observedAt }) {
  const isSpot = market === 'spot';
  const now = observedAt ? Date.parse(observedAt) : Date.now();

  if (isSpot) {
    const ticker = asObj(reads.spot_ticker24hr?.data);
    const depth = asObj(reads.spot_depth?.data);
    const oneHour = resolveOneHourSeries(reads.spot_klines?.data, now);
    return {
      market,
      symbol,
      observedAt,
      priceNow: Number(ticker.lastPrice),
      price24hAgo: Number(ticker.openPrice),
      oneHour,
      bids: depth.bids || [],
      asks: depth.asks || [],
      fundingRate: null, // spot has no funding
    };
  }

  // USDⓈ-M futures
  const ticker = asObj(reads.futures_ticker24hr?.data);
  const depth = asObj(reads.futures_orderbook?.data);
  const oneHour = resolveOneHourSeries(reads.futures_klines?.data, now);
  const funding = asArr(reads.futures_funding?.data)
    .map((f) => ({ time: Number(f.fundingTime), rate: Number(f.fundingRate) }))
    .filter((f) => Number.isFinite(f.time) && Number.isFinite(f.rate))
    .sort((a, b) => a.time - b.time); // ascending; latest = max fundingTime
  const latestFunding = funding.length ? funding[funding.length - 1].rate : null;

  return {
    market,
    symbol,
    observedAt,
    priceNow: Number(ticker.lastPrice),
    price24hAgo: Number(ticker.openPrice),
    oneHour,
    bids: depth.bids || [],
    asks: depth.asks || [],
    fundingRate: latestFunding,
  };
}
