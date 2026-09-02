// Deterministic natural-language → structured idea extractor.
// Free text trade ideas → { symbol, direction, market, size }. Rule-based so it is
// testable and honest: it never *guesses* a symbol the market check can't verify.
//
// Honesty rule, two layers:
//   1. A SPELLED-OUT market (SYMBOL + a quote suffix, e.g. HYPEUSDT) is honoured
//      for ANY base — no whitelist gate. The user typed an explicit ticker; if the
//      market doesn't exist the live read says so ("no such market"), which is the
//      honest outcome, not a guess.
//   2. A BARE WORD is only treated as a ticker if it is a known Binance base
//      (KNOWN_BASES below). That keeps ordinary English ("the weather is nice in
//      berlin") from being mistaken for a symbol. Best-effort coverage — anything
//      missing is always reachable by spelling it: "HYPEUSDT".
// The engine's own market lookup is the final guard in both cases.

const QUOTE_SUFFIXES = ['USDT', 'USDC', 'BUSD', 'FDUSD', 'TUSD', 'USDP', 'BTC', 'ETH', 'BNB', 'EUR', 'TRY', 'DAI', 'PAX'];
// Known Binance USDⓈ-M bases (spot and perpetual names overlap). Not exhaustive by
// design — the suffixed-token rule above backstops anything not listed here.
const KNOWN_BASES = new Set([
  // Blue chips & large caps
  'BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'DOGE', 'ADA', 'AVAX', 'MATIC', 'POL', 'LINK', 'DOT',
  'SHIB', 'PEPE', 'LTC', 'BCH', 'NEAR', 'APT', 'ARB', 'OP', 'SUI', 'TIA', 'INJ', 'FIL', 'ATOM',
  'UNI', 'AAVE', 'MKR', 'LDO', 'RUNE', 'GALA', 'SAND', 'MANA', 'AXS', 'CRV', 'ENS', 'FTM', 'S',
  'WLD', 'SEI', 'JUP', 'PYTH', 'ONDO', 'STRK', 'HBAR', 'VET', 'TRX', 'TON', 'T', 'ZK', 'BOME',
  'HYPE', 'TRUMP', 'IP', 'BERA', 'KAITO', 'EIGEN', 'ENA', 'PENGU', 'TAO', 'KAS', 'RENDER', 'RNDR',
  'WIF', 'BONK', 'FLOKI', 'TURBO', 'AR', 'ETC', 'XLM', 'XMR', 'ALGO', 'ZEC', 'DASH', 'NEO',
  'XTZ', 'IOTA', 'THETA', 'EGLD', 'FLOW', 'MINA', 'KSM', 'FET', 'AGIX', 'OCEAN', 'GRT', 'IMX',
  'SNX', 'COMP', 'YFI', 'SUSHI', 'CAKE', 'DYDX', 'BLUR', 'PENDLE', 'AIOZ', 'ZRO', 'BLAST',
  'LISTA', 'BB', 'NOT', 'DOGS', 'HMSTR', 'CATI', 'NEIRO', 'W', 'JASMY', 'STORJ', 'MASK',
  'SLP', 'CFX', '1INCH', 'CRV', 'GNO', 'RPL', 'ANKR', 'BAND', 'OCEAN', 'DENT', 'HOT',
]);

function norm(s) {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, ' ');
}

/**
 * Strip a known quote suffix to find the base (e.g. BNBUSDT -> BNB).
 * Any base is accepted here — a spelled-out SYMBOLUSDT is unambiguous user input,
 * and the engine's live/exchange check is the guard against a non-existent market.
 */
function baseOf(token) {
  const t = token.toUpperCase();
  for (const q of QUOTE_SUFFIXES) {
    if (t.endsWith(q) && t.length > q.length) {
      const base = t.slice(0, -q.length);
      // A suffix-within-a-base edge: only strip once, and don't reduce a base to
      // empty. e.g. ETHUSDT -> ETH (good); USDT alone is STOPped earlier anyway.
      if (base.length >= 2 && /^[A-Z0-9]+$/.test(base)) return base;
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
    if (word.length < 2 || word.length > 16) continue;
    if (STOP.has(word)) continue;
    if (!/^[A-Z][A-Z0-9]*$/.test(word)) continue;
    candidates.push(word);
  }
  // Prefer a spelled-out market token (SYMBOLUSDT), stripped to its base — any base
  // counts; the live read will confirm the market. Else a known bare base.
  const suffixed = candidates.find((c) => baseOf(c));
  const known = candidates.find((c) => KNOWN_BASES.has(c));
  symbol = suffixed ? baseOf(suffixed) : known || null;

  return { symbol, direction, market, size: null };
}
