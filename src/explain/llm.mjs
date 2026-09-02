// Env-driven LLM provider (Anthropic Messages API shape).
//
// Preflight's LLM config is ISOLATED from this Claude Code session's own
// provider env (ANTHROPIC_BASE_URL=agentrouter + DeepSeek). The session may not
// be touched, so Preflight reads, in priority order:
//   key   : PREFLIGHT_LLM_API_KEY (or PREFLIGHT_ANTHROPIC_API_KEY)
//           then ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN
//   base  : PREFLIGHT_LLM_BASE_URL else ANTHROPIC_BASE_URL else https://api.anthropic.com
//           (when PREFLIGHT_LLM_API_KEY is set and no base is given → api.anthropic.com)
//   model : PREFLIGHT_LLM_MODEL else ANTHROPIC_MODEL else claude-sonnet-4-5
//
// An optional gitignored <repo>/.env is loaded first (KEY=VALUE lines) so a key
// can live in a file without touching the session env. Zero deps: plain fetch.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Repo root, computed with path ops only. (NOT `new URL('../../', import.meta.url)`:
// webpack special-cases that as an asset reference and fails the Vercel build with
// "Can't resolve '../../'".) Correct under plain Node for CLI/tests; if a bundler
// rewrites import.meta.url, the .env lookup below simply no-ops — harmless, since
// the web route never calls the LLM.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');

/** Load <repo>/.env into process.env if present, never overriding real env. */
function loadDotEnv() {
  try {
    const p = path.join(REPO_ROOT, '.env');
    if (!fs.existsSync(p)) return;
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m || line.trimStart().startsWith('#')) continue;
      const [, name, raw] = m;
      if (!(name in process.env)) {
        let val = raw.trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
        process.env[name] = val;
      }
    }
  } catch { /* .env is optional — ignore read errors */ }
}
loadDotEnv();

export function llmConfig() {
  const env = process.env;
  const preKey = env.PREFLIGHT_LLM_API_KEY || env.PREFLIGHT_ANTHROPIC_API_KEY || null;
  let base, key, model;
  if (preKey) {
    key = preKey;
    base = env.PREFLIGHT_LLM_BASE_URL || 'https://api.anthropic.com';
    model = env.PREFLIGHT_LLM_MODEL || 'claude-sonnet-4-5';
  } else {
    key = env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN || null;
    base = (env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/$/, '');
    model = env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';
  }
  return { base, key, model };
}

/** Describe provider WITHOUT the secret — for logs / demo headers. */
export function describeProvider() {
  const { base, key, model } = llmConfig();
  const red = key ? `${key.slice(0, 6)}…${key.slice(-3)}` : '(none)';
  return { base, model, key: red, available: Boolean(key) };
}

export function llmAvailable() {
  return Boolean(llmConfig().key);
}

/** Send a short completion. Returns assistant text. Throws on failure/HTTP error. */
export async function complete(prompt, { maxTokens = 500, temperature = 0.2 } = {}) {
  const { base, key, model } = llmConfig();
  if (!key) throw new Error('No LLM key configured. Set PREFLIGHT_LLM_API_KEY (or ANTHROPIC_API_KEY) or add a .env file.');
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
