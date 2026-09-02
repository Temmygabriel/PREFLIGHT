// POST /api/check — Preflight's single endpoint.
// Body: { text: "trade idea sentence", mode?: 'auto'|'live'|'replay' }
// Reads live Binance MCP when PREFLIGHT_MCP_TOKEN is set (auto), else replay.
import { NextResponse } from 'next/server';
import { checkIdea } from '../../../lib/checkIdea.mjs';

export const runtime = 'nodejs';
export const maxDuration = 20;

export async function POST(req) {
  let body = {};
  try { body = await req.json(); } catch { /* fall through to empty body */ }
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const mode = body.mode === 'live' || body.mode === 'replay' ? body.mode : 'auto';
  if (!text) {
    return NextResponse.json({ ok: false, code: 'no_idea', message: 'Type a trade idea first — e.g. “Buying BNB” or “Short ETHUSDT perpetual”.' }, { status: 400 });
  }
  const result = await checkIdea(text, { mode });
  const status = result.ok ? 200 : result.code === 'no_idea' ? 422 : 404;
  return NextResponse.json(result, { status });
}
