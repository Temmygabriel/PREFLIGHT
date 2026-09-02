// Deterministic natural-language → structured idea extractor.
// Free text trade ideas → { symbol, direction, market, size }. Rule-based so it is
// testable and never hallucinates a symbol the engine can't check. LLM extraction
// can layer on top later; this keeps the core honest.

const QUOTE_SUFFIXES = ['USDT', 'USDC', 'BUSD', 'FDUSD', 'TUSD', 'USDP', 'BTC', 'ETH', 'BNB', 'EUR', 'TRY', 'DAI', 'PAX'];
const KNOWN_BASES = new Set([
  'BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'DOGE', 'ADA', 'AVAX', 'MATIC', 'POL', 'LINK', 'DOT',
  'SHIB', 'PEPE', 'LTC', 'BCH', 'NEAR', 'APT', 'ARB', 'OP', 'SUI', 'TIA', 'INJ', 'FIL', 'ATOM',
  'UNI', 'AAVE', 'MKR', 'LDO', 'RUNE', 'GALA', 'SAND', 'MANA', 'AXS', 'CRV', 'ENS', 'FTM', 'S',
  'WLD', 'SEI', 'JUP', 'PYTH', 'ONDO', 'STRK', 'HBAR', 'VET', 'TRX', 'TON', 'T', 'ZK', 'BOME',
]);

function norm(s) {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, ' ');
}

/** Strip a known quote suffix to find the base (e.g. BNBUSDT -> BNB). */
function baseOf(token) {
  const t = token.toUpperCase();
  for (const q of QUOTE_SUFFIXES) {
    if (t.endsWith(q) && t.length > q.length) {
      const base = t.slice(0, -q.length);
      if (KNOWN_BASES.has(base)) return base;
    }
  }
  return null;
}

/** Extract { symbol, direction, market, size } from free text. Unknown = null. */
export function extractTradeIdea(text) {
  if (!text) return { symbol: null, direction: null, market: null, size: null };

  const dirLower = text.toLowerCase();

  const buyWords = ['buy', 'long', 'breakout', 'breaking out', 'bullish', 'pump', 'upside', 'accumulate', 'going up', 'rally'];
  const sellWords = ['sell', 'short', 'breakdown', 'bearish', 'dump', 'downside', 'de-risk', 'going down', 'drop'];

  const direction = buyWords.some((w) => dirLower.includes(w)) ? 'buy'
    : sellWords.some((w) => dirLower.includes(w)) ? 'sell'
      : null;

  let market = null;
  if (/coin-?m|futures_coin/i.test(dirLower)) market = 'futures_coin';
  else if (/futures|perp|perpetual|usd.?s-?m|usds/i.test(dirLower)) market = 'futures_usds';
  else if (/spot|cash/i.test(dirLower)) market = 'spot';

  // Symbol detection: scan upper-cased tokens. Ignore context/noise words.
  const STOP = new Set(['SPOT', 'FUTURES', 'USDT', 'USDC', 'USD', 'BUY', 'SELL', 'LONG', 'SHORT', 'PERP', 'PERPETUAL', 'BREAKOUT', 'BREAKING', 'BREAKS', 'PUMP', 'DUMP', 'RALLY', 'FEELS', 'HERE', 'LIKE', 'THINK', 'THINKING', 'ABOUT', 'AND', 'THE', 'IS', 'ARE', 'OUT', 'UP', 'DOWN', 'AT', 'ON', 'TO', 'A']);
  let symbol = null;
  const candidates = [];
  for (const word of norm(text).split(/\s+/)) {
    if (word.length < 2 || word.length > 10) continue;
    if (STOP.has(word)) continue;
    if (!/^[A-Z][A-Z0-9]*$/.test(word)) continue;
    candidates.push(word);
  }
  // Prefer a token with a quote suffix, stripping it to its base; else a known base.
  const suffixed = candidates.find((c) => baseOf(c));
  const known = candidates.find((c) => KNOWN_BASES.has(c));
  symbol = suffixed ? baseOf(suffixed) : known || null;

  return { symbol, direction, market, size: null };
}
