// checkIdea: the framework-agnostic core behind POST /api/check.
//
//   text  → extractTradeIdea → live MCP read (if a token exists) → evidence brief
//          → deterministic template explanation.
//   Live first, replay fallback on ANY failure — a demo never breaks. Every
//   number in the response is engine-computed; the explanation only restates it.
import { extractTradeIdea } from '../src/explain/extractor.mjs';
import { runEvidenceFromSnapshot } from '../src/evidence/pipeline.mjs';
import { explain } from '../src/explain/explainer.mjs';
import { find, list, supportedBases } from './snapshotStore.mjs';
import { fetchLive, liveAvailable } from './liveProvider.mjs';

const MARKET_LABEL = { spot: 'spot', futures_usds: 'futures (USDⓈ-M)' };
// When a live read says the pair doesn't exist on the requested market (e.g. HYPE is
// perp-only: no HYPEUSDT spot), retry the other market instead of failing on a keyword
// the user never typed. Direction/claim are unchanged; only the market label differs.
const OTHER_MARKET = { spot: 'futures_usds', futures_usds: 'spot' };

/**
 * True when an MCP error means "this symbol doesn't exist on that market"
 * (Binance API code -1121 / "Invalid symbol"), as opposed to a transient or
 * auth failure. Used to decide whether a cross-market retry is safe.
 */
export function isMarketNotFound(e) {
  return /-1121|invalid symbol|does not exist|market.*not exist/i.test(String((e && e.message) || e));
}

function friendlyError(e, symbol, market) {
  const msg = String((e && e.message) || e);
  if (e && e.name === 'AbortError') return `Live read for ${symbol}/${market} timed out.`;
  if (/isError|not found|symbol.*invalid|does not exist|no symbol|market.*not exist/i.test(msg)) {
    return `“${symbol}” doesn't look like a live ${MARKET_LABEL[market] || market} market on Binance right now.`;
  }
  return `Live read failed (${msg.slice(0, 90)}).`;
}

/**
 * Resolve one trade idea to a safe response object.
 * mode: 'auto' (live when token present, else replay) | 'replay' | 'live'.
 */
export async function checkIdea(text, { mode = 'auto' } = {}) {
  const idea = extractTradeIdea(text || '');
  if (!idea.symbol || !idea.direction) {
    return {
      ok: false,
      code: 'no_idea',
      message: `Preflight couldn't read ${!idea.symbol ? 'a ticker' : ''}${!idea.symbol && !idea.direction ? ' or ' : ''}${!idea.direction ? 'a direction' : ''} from that. Try “Buying BNB” or “Short ETHUSDT perpetual”.`,
      supported: supportedBases(),
    };
  }

  const market = idea.market || 'spot';
  const symbol = `${idea.symbol}USDT`;
  const wantLive = mode !== 'replay' && (mode === 'live' || (mode === 'auto' && liveAvailable()));

  let snapshot = null;
  let source = null;
  let liveError = null;
  let marketUsed = market; // flips to the other market only when live proves the first has no such pair

  if (wantLive) {
    try {
      snapshot = await fetchLive({ symbol, market: marketUsed });
    } catch (e) {
      const other = OTHER_MARKET[marketUsed];
      if (other && isMarketNotFound(e)) {
        try {
          snapshot = await fetchLive({ symbol, market: other });
          marketUsed = other;
        } catch (e2) {
          liveError = e2;
        }
      } else {
        liveError = e;
      }
    }
    if (snapshot) source = 'live';
  }

  if (!snapshot) {
    marketUsed = market; // replay is deterministic to the requested market
    snapshot = find(symbol, marketUsed);
    source = 'replay';
    if (!snapshot) {
      if (liveError) {
        return { ok: false, code: 'live_failed', marketMissing: isMarketNotFound(liveError), symbol, message: friendlyError(liveError, symbol, marketUsed), supported: supportedBases() };
      }
      const have = list().map((h) => `${h.symbol.replace(/USDT$/, '')} (${h.market})`).join(', ');
      return {
        ok: false,
        code: 'no_data',
        message: `No captured data for ${symbol} ${marketUsed}. Captured: ${have || 'none'}. Add PREFLIGHT_MCP_TOKEN for live reads.`,
        supported: list(),
      };
    }
  }

  const brief = runEvidenceFromSnapshot({ idea: { symbol, market: marketUsed, direction: idea.direction }, snapshot });
  const explanation = await explain(brief, { mode: 'template' });

  return {
    ok: true,
    source,
    autoMarket: marketUsed !== market,
    liveError: liveError ? friendlyError(liveError, symbol, marketUsed) : null,
    idea: { symbol, base: idea.symbol, market: marketUsed, marketLabel: MARKET_LABEL[marketUsed] || marketUsed, direction: idea.direction },
    brief: {
      symbol: brief.symbol,
      market: brief.market,
      direction: brief.direction,
      observedAt: brief.observedAt,
      computedAt: brief.computedAt,
      verdict: brief.verdict,
      confidence: brief.confidence,
      confidenceBreakdown: brief.confidenceBreakdown,
      contradiction: { flag: brief.contradiction.flag, detail: brief.contradiction.detail },
      evidence: brief.evidence.map((e) => ({
        metric: e.metric,
        result: e.result,
        support: e.supports_claim === true ? 'supports' : e.supports_claim === false ? 'contradicts' : e.tone ? `activity:${e.tone}` : 'neutral',
      })),
    },
    explanation: { text: explanation.text, mode: explanation.mode },
  };
}
