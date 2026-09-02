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

  if (wantLive) {
    try {
      snapshot = await fetchLive({ symbol, market });
      source = 'live';
    } catch (e) {
      liveError = e;
    }
  }

  if (!snapshot) {
    snapshot = find(symbol, market);
    source = 'replay';
    if (!snapshot) {
      if (liveError) {
        return { ok: false, code: 'live_failed', message: friendlyError(liveError, symbol, market), supported: supportedBases() };
      }
      const have = list().map((h) => `${h.symbol.replace(/USDT$/, '')} (${h.market})`).join(', ');
      return {
        ok: false,
        code: 'no_data',
        message: `No captured data for ${symbol} ${market}. Captured: ${have || 'none'}. Add PREFLIGHT_MCP_TOKEN for live reads.`,
        supported: list(),
      };
    }
  }

  const brief = runEvidenceFromSnapshot({ idea: { symbol, market, direction: idea.direction }, snapshot });
  const explanation = await explain(brief, { mode: 'template' });

  return {
    ok: true,
    source,
    liveError: liveError ? friendlyError(liveError, symbol, market) : null,
    idea: { symbol, base: idea.symbol, market, marketLabel: MARKET_LABEL[market] || market, direction: idea.direction },
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
