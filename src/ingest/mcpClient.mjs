// Minimal MCP Streamable-HTTP client for the Binance Agent OS server.
// Verified working against https://agent.binance.com/mcp/agentic on 2026-09-02
// (direct tools/call; no META-mode tool_execute needed). See docs/mcp-capabilities.md.
//
// Token resolution order: PREFLIGHT_MCP_TOKEN env var, else the OAuth token that
// `claude mcp login` wrote to ~/.claude/.credentials.json (local dev convenience).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const MCP_URL = 'https://agent.binance.com/mcp/agentic';
const PROTOCOL = '2025-06-18';

export function resolveToken() {
  if (process.env.PREFLIGHT_MCP_TOKEN) return process.env.PREFLIGHT_MCP_TOKEN;
  const credPath = path.join(os.homedir(), '.claude', '.credentials.json');
  if (fs.existsSync(credPath)) {
    try {
      const creds = JSON.parse(fs.readFileSync(credPath, 'utf8'));
      for (const e of Object.values(creds.mcpOAuth || {})) {
        if (e.serverName === 'binance-mcp-server' && e.accessToken) return e.accessToken;
      }
    } catch {}
  }
  return null;
}

/** Create a bound client: handshake once, then client.callTool(name, args).
 *  Optional `signal` (AbortSignal) aborts in-flight fetches (used by serverless). */
export async function connect(opts = {}) {
  const { token = resolveToken(), url = MCP_URL, signal } = opts;
  if (!token) throw new Error('No MCP bearer token. Set PREFLIGHT_MCP_TOKEN or run `claude mcp login binance-mcp-server`.');
  let sessionId = null;

  async function post(method, params) {
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'Authorization': `Bearer ${token}`,
      'MCP-Protocol-Version': PROTOCOL,
    };
    if (sessionId) headers['Mcp-Session-Id'] = sessionId;
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id: Math.floor(Math.random() * 1e9), method, params }),
      signal,
    });
    if (!sessionId && res.headers.get('mcp-session-id')) sessionId = res.headers.get('mcp-session-id');
    const text = await res.text();
    let body;
    if ((res.headers.get('content-type') || '').includes('text/event-stream') || text.trimStart().startsWith('data:')) {
      const frames = text
        .split('\n').filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trim()).filter(Boolean)
        .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      body = frames[frames.length - 1];
    } else {
      try { body = JSON.parse(text); } catch { body = text; }
    }
    return { status: res.status, body };
  }

  const init = await post('initialize', {
    protocolVersion: PROTOCOL,
    capabilities: {},
    clientInfo: { name: 'preflight-evidence', version: '0.1.0' },
  });
  if (!init.body?.result) throw new Error(`MCP initialize failed: ${JSON.stringify(init.body || init.status)}`);

  await post('notifications/initialized', {}).catch(() => {});

  return {
    /** Call an MCP tool; returns the decoded result (the tool's data, not MCP envelope). */
    async callTool(name, args = {}) {
      const r = await post('tools/call', { name, arguments: args });
      if (r.body?.error) throw new Error(`${name} error: ${JSON.stringify(r.body.error)}`);
      if (r.body?.result?.isError) {
        const txt = textOf(r.body.result.content);
        throw new Error(`${name} isError: ${(txt || JSON.stringify(r.body.result)).slice(0, 400)}`);
      }
      const txt = textOf(r.body?.result?.content);
      return JSON.parse(txt);
    },
    async close() {
      await post('notifications/cancelled', {}).catch(() => {});
    },
  };
}

function textOf(content) {
  if (Array.isArray(content)) return content.map((x) => x.text || x.content || JSON.stringify(x)).join('');
  if (content && content.text) return content.text;
  return '';
}
