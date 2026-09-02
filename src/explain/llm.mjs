// Env-driven LLM provider (Anthropic Messages API shape).
// Reads ANTHROPIC_BASE_URL / ANTHROPIC_API_KEY (or ANTHROPIC_AUTH_TOKEN) /
// ANTHROPIC_MODEL from the environment, so it works against api.anthropic.com OR
// any Anthropic-compatible endpoint (e.g. the agentrouter used for this demo).
// Zero deps: plain fetch. No key is hardcoded anywhere.

export function llmConfig() {
  const base = (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/$/, '');
  const key = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || null;
  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';
  return { base, key, model };
}

export function llmAvailable() {
  return Boolean(llmConfig().key);
}

/** Send a short completion. Returns assistant text. Throws on failure/HTTP error. */
export async function complete(prompt, { maxTokens = 500, temperature = 0.2 } = {}) {
  const { base, key, model } = llmConfig();
  if (!key) throw new Error('No LLM key configured (ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN).');
  const url = `${base}/v1/messages`;
  const body = {
    model,
    max_tokens: maxTokens,
    temperature,
    messages: [{ role: 'user', content: prompt }],
  };
  const headers = {
    'Content-Type': 'application/json',
    'anthropic-version': '2023-06-01',
    'x-api-key': key,
  };
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  if (res.status === 401) {
    // Some proxies expect Authorization: Bearer instead of x-api-key.
    headers.Authorization = `Bearer ${key}`;
    delete headers['x-api-key'];
    const retry = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    return parseMessages(retry);
  }
  return parseMessages(res);
}

async function parseMessages(res) {
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { throw new Error(`LLM non-JSON (${res.status}): ${text.slice(0, 200)}`); }
  if (!res.ok) throw new Error(`LLM error ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  const out = (json.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  if (!out) throw new Error('LLM returned no text.');
  return out;
}
