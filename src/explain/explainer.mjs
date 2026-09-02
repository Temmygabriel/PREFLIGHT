// Explainer: turns an already-computed brief into a short plain-language verdict.
//
// Preflight rule (plan §3): the LLM explains ONLY the structured evidence object —
// never raw market data, never computing. Confidence level is decided in code and
// handed to the LLM as a fact. Two paths:
//   explain(brief, {mode:'llm'})    -> LLM, prompt contains only the fact sheet
//   explain(brief, {mode:'template'}) -> deterministic fallback, zero network
import { llmAvailable, complete } from './llm.mjs';

const SUPPORT_LABEL = { true: 'supports', false: 'contradicts', null: 'neutral' };

/** A safe, self-contained fact sheet extracted from the brief. No raw prices added. */
export function buildFactSheet(brief) {
  return {
    idea: { symbol: brief.symbol, market: brief.market, direction: brief.direction, claim: brief.claim },
    verdict: brief.verdict,
    confidence: brief.confidence,
    contradiction: brief.contradiction.flag ? brief.contradiction.detail : 'none flagged',
    evidence: brief.evidence.map((e) => ({
      metric: e.metric,
      result: e.result,
      support: SUPPORT_LABEL[e.supports_claim] ?? (e.tone ? `activity: ${e.tone}` : 'neutral'),
    })),
    observedAt: brief.observedAt,
  };
}

/** Deterministic fallback — assembles the same facts in plain words, no LLM. */
export function explainTemplate(brief) {
  const fs = buildFactSheet(brief);
  const lines = fs.evidence.map((e) => `- ${e.metric.replace(/_/g, ' ')}: ${e.result} (${e.support})`);
  const direction = fs.idea.direction === 'buy' ? 'buy' : 'sell';
  return (
    `For ${fs.idea.symbol} on ${fs.idea.market}, the ${direction} idea is rated ${fs.confidence} confidence — ${fs.verdict}. ` +
    `Evidence at ${fs.observedAt}:\n${lines.join('\n')}\n` +
    `Contradictions: ${fs.contradiction}.`
  );
}

const SYSTEM_RULES = `You are Preflight, a cautious pre-trade reviewer. A user has a trade idea and you have
been given the STRUCTURED evidence a deterministic engine computed from live market data.

Rules — follow strictly:
1. Explain whether the evidence supports the idea, using ONLY the facts below.
2. Do NOT introduce any number, price, metric, or fact that is not in the list.
3. Do NOT compute anything or restate formulas. Do not give investment advice.
4. State the confidence level and verdict exactly as given.
5. 2-4 plain sentences, no markdown, no preamble, no "I".`;

export function explainPrompt(brief) {
  const fs = buildFactSheet(brief);
  return `${SYSTEM_RULES}

TRADE IDEA: ${fs.idea.claim}  (${fs.idea.symbol}, ${fs.idea.market}, direction ${fs.idea.direction})
COMPUTED VERDICT: ${fs.verdict}
COMPUTED CONFIDENCE: ${fs.confidence}
CONTRADICTIONS: ${fs.contradiction}

EVIDENCE (computed by the engine — explain, never recompute):
${fs.evidence.map((e) => `- ${e.metric}: ${e.result} (${e.support})`).join('\n')}

Give your short explanation now.`;
}

/**
 * Explain a brief. mode 'auto' uses the LLM when a key is configured and the call
 * succeeds, and degrades to the deterministic template on any failure (network,
 * 401, malformed response) so a demo never dies on upstream LLM trouble.
 * mode 'llm' forces the LLM and throws on failure. mode 'template' never networks.
 */
export async function explain(brief, { mode = 'auto', temperature = 0.2 } = {}) {
  const useLLM = mode === 'llm' || (mode === 'auto' && llmAvailable());
  if (!useLLM) return { text: explainTemplate(brief), mode: 'template', llm: false };
  try {
    const text = await complete(explainPrompt(brief), { maxTokens: 300, temperature });
    return { text, mode: 'llm', llm: true, model: (await import('./llm.mjs')).llmConfig().model };
  } catch (err) {
    if (mode === 'llm') throw err;
    return { text: explainTemplate(brief), mode: 'template', llm: false, error: err.message };
  }
}
