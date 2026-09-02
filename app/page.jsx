'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/* ── Preflight — the pre-flight checklist for your trades ────────────────── */

const EXAMPLES = [
  { label: 'Buying BNB', text: 'Buying BNB here, feels like a breakout.' },
  { label: 'Short ETHUSDT perps', text: 'Shorting ETHUSDT perpetual, looks weak.' },
  { label: 'Long SOL on spot', text: 'SOL looks strong, going long on spot.' },
];

const METRIC_LABEL = {
  price_move_24h: 'PRICE TREND · 24H',
  order_book_imbalance: 'ORDER BOOK IMBALANCE',
  volume_vs_baseline: 'VOLUME VS BASELINE',
  funding_rate: 'FUNDING RATE',
};

const VERDICT = {
  'evidence supports the idea': { stamp: 'CLEARED', cls: 'stamp-clear', tone: 'GO — evidence lines up with your idea.' },
  'evidence is mixed': { stamp: 'REVIEW', cls: 'stamp-mix', tone: 'Evidence points both ways. Check before you fly.' },
  'evidence contradicts the idea': { stamp: 'HOLD', cls: 'stamp-hold', tone: 'Evidence runs against the idea. Do not fly.' },
  'insufficient directional signal': { stamp: 'CHECK', cls: 'stamp-check', tone: 'Not enough directional signal yet.' },
};

const CONF_LABEL = { High: 'HIGH', Medium: 'MEDIUM', Low: 'LOW' };

function badgeFor(support) {
  if (support === 'supports') return { tag: 'PASS', cls: 'badge-pass' };
  if (support === 'contradicts') return { tag: 'FAIL', cls: 'badge-fail' };
  if (support && support.startsWith('activity:')) return { tag: 'CHECK', cls: 'badge-check' };
  return { tag: 'NEUTRAL', cls: 'badge-neutral' };
}

function pretty(support) {
  if (support === 'supports') return 'supports the idea';
  if (support === 'contradicts') return 'contradicts the idea';
  if (support && support.startsWith('activity:')) return support.replace('activity:', 'activity: ');
  return 'neutral';
}

export default function Page() {
  const [text, setText] = useState(EXAMPLES[0].text);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);   // ok response
  const [error, setError] = useState(null);     // {message}
  const [history, setHistory] = useState([]);
  const autoRan = useRef(false);

  useEffect(() => {
    try {
      const h = JSON.parse(localStorage.getItem('preflight:history') || '[]');
      if (Array.isArray(h)) setHistory(h.slice(0, 6));
    } catch { /* ignore */ }
    if (!autoRan.current) {
      autoRan.current = true;
      run(EXAMPLES[0].text, 'auto');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pushHistory = useCallback((idea, res) => {
    const entry = {
      text: idea.slice(0, 80),
      base: res?.brief?.symbol || '',
      direction: res?.brief?.direction || '',
      verdict: res?.brief?.verdict || 'error',
      confidence: res?.brief?.confidence || '',
      at: Date.now(),
    };
    setHistory((prev) => {
      const next = [entry, ...prev].slice(0, 6);
      try { localStorage.setItem('preflight:history', JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const run = useCallback(async (idea, mode = 'auto') => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: idea, mode }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError({ message: data.message || 'Preflight could not complete the check.' });
        pushHistory(idea, null);
        return;
      }
      setResult(data);
      pushHistory(idea, data);
    } catch (e) {
      setError({ message: 'Network error — could not reach the Preflight API.' });
    } finally {
      setBusy(false);
    }
  }, [pushHistory]);

  const v = result ? (VERDICT[result.brief.verdict] || VERDICT['insufficient directional signal']) : null;

  return (
    <main className="wrap">
      {/* ── Header ── */}
      <header className="fadeup" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap' }}>
        <div>
          <div className="wordmark">Preflight</div>
          <p className="tagline" style={{ maxWidth: 520 }}>
            The pre-flight checklist for your trades. Before an agent moves your money, Preflight reads the
            market and stamps a verdict — <b style={{ color: 'var(--ink)' }}>computed in code, never guessed.</b>
          </p>
        </div>
        <div className="eyebrow" style={{ textAlign: 'right' }}>
          BINANCE AGENT OS<br />TRACK A
        </div>
      </header>

      {/* ── Input ── */}
      <section className="panel panel-pad fadeup" style={{ marginTop: 26 }}>
        <div className="eyebrow">01 · Trade idea</div>
        <textarea
          className="idea-input"
          style={{ marginTop: 12, minHeight: 88 }}
          value={text}
          placeholder='Describe the move you want to make, e.g. "Buying BNB, breaking out".'
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') run(text); }}
        />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {EXAMPLES.map((ex) => (
              <button key={ex.label} type="button" className="btn-ghost" onClick={() => { setText(ex.text); setResult(null); }}>
                {ex.label}
              </button>
            ))}
          </div>
          <button type="button" className="btn" disabled={busy || !text.trim()} onClick={() => run(text)}>
            {busy ? 'RUNNING CHECKLIST…' : 'RUN PREFLIGHT'}
          </button>
        </div>
      </section>

      {/* ── Loading ── */}
      {busy && (
        <section className="panel panel-pad fadeup" style={{ marginTop: 18 }}>
          <div className="eyebrow">02 · Running the checklist</div>
          <div className="muted" style={{ fontSize: 13, lineHeight: 1.9, marginTop: 8 }}>
            <div><span className="blink">▸</span> pulling {text.includes('perpetual') || text.includes('futures') ? 'futures' : 'spot'} market data…</div>
            <div><span className="blink">▸</span> price trend · order book · volume{/* funding shown for futures */}</div>
            <div><span className="blink">▸</span> computing contradiction check &amp; confidence</div>
          </div>
        </section>
      )}

      {/* ── Result ── */}
      {result && v && (
        <section key={result.brief.computedAt} className="fadeup" style={{ marginTop: 18 }}>
          {/* identity strip */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
            <span className="chip"><b>{result.brief.symbol}</b></span>
            <span className="pill pill-buy" style={result.brief.direction === 'sell' ? { color: 'var(--red)', borderColor: 'rgba(255,106,95,.45)' } : undefined}>
              {result.brief.direction === 'buy' ? 'BUY' : 'SELL'}
            </span>
            <span className="chip">{result.idea.marketLabel}</span>
            <span className={result.source === 'live' ? 'badge badge-live' : 'badge badge-replay'} style={{ marginLeft: 'auto' }}>
              {result.source === 'live' ? '● LIVE DATA' : '◌ REPLAYED SNAPSHOT'}
            </span>
          </div>

          {/* stamp + verdict */}
          <div className="panel panel-pad" style={{ display: 'flex', alignItems: 'center', gap: 26, flexWrap: 'wrap' }}>
            <div className={`stamp ${v.cls}`}>{v.stamp}</div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '0.02em' }}>{v.tone}</div>
              <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
                {result.brief.confidenceBreakdown.agree} agree · {result.brief.confidenceBreakdown.neutral} neutral · {result.brief.confidenceBreakdown.disagree} disagree
              </div>
              <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                confidence <b style={{ color: 'var(--ink)' }}>{CONF_LABEL[result.brief.confidence] || result.brief.confidence}</b> — computed by code, never guessed
              </div>
            </div>
          </div>

          {/* contradiction alert */}
          {result.brief.contradiction.flag && (
            <div style={{ marginTop: 12, padding: '12px 16px', borderRadius: 10, background: 'var(--red-bg)', border: '1px solid rgba(255,106,95,.4)', color: 'var(--red)', fontSize: 13.5 }}>
              ⚠ CONTRADICTION FLAGGED — {result.brief.contradiction.detail}
            </div>
          )}

          {/* checklist */}
          <div className="panel panel-pad" style={{ marginTop: 14 }}>
            <div className="eyebrow">03 · Evidence checklist</div>
            <div style={{ marginTop: 10 }}>
              {result.brief.evidence.map((e) => {
                const b = badgeFor(e.support);
                return (
                  <div className="row" key={e.metric}>
                    <span className="metric">{METRIC_LABEL[e.metric] || e.metric.replace(/_/g, ' ').toUpperCase()}</span>
                    <span className="value">{e.result}</span>
                    <span className={`badge ${b.cls}`}>{b.tag}</span>
                    <span className="muted" style={{ width: 150, textAlign: 'left', fontSize: 11.5 }}>{pretty(e.support)}</span>
                  </div>
                );
              })}
            </div>
            <hr className="hr" />
            <div className="muted" style={{ fontSize: 11.5, lineHeight: 1.6 }}>
              Data: {result.source === 'live' ? 'live via Binance Agent OS MCP' : `real ${result.brief.symbol} snapshot captured from Binance via Agent OS MCP, replayed`} · observed {new Date(result.brief.observedAt).toISOString()}.{' '}
              The engine reads and computes; no model decided this.
            </div>
          </div>

          {/* explanation */}
          <div className="panel panel-pad" style={{ marginTop: 14 }}>
            <div className="eyebrow">04 · Plain-language brief</div>
            <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.8, margin: '10px 0 0', whiteSpace: 'pre-line', color: 'var(--ink)' }}>
              {result.explanation.text}
            </p>
          </div>
        </section>
      )}

      {/* ── Error ── */}
      {error && (
        <section className="panel panel-pad fadeup" style={{ marginTop: 18, borderColor: 'rgba(255,106,95,.4)' }}>
          <div style={{ color: 'var(--red)', fontSize: 14, fontWeight: 700 }}>NO GO</div>
          <div className="muted" style={{ fontSize: 13.5, marginTop: 8 }}>{error.message}</div>
        </section>
      )}

      {/* ── How it works + history ── */}
      {!busy && !result && (
        <section className="panel panel-pad fadeup" style={{ marginTop: 18 }}>
          <div className="eyebrow">The 10-second pitch</div>
          <ol className="muted" style={{ fontSize: 13, lineHeight: 2, margin: '10px 0 0', paddingLeft: 20 }}>
            <li>You state a trade idea in plain language — as you would to an agent.</li>
            <li>Preflight pulls real market data and runs four deterministic checks: price trend, order book, volume, funding.</li>
            <li>It stamps <b style={{ color: 'var(--ink)' }}>CLEARED</b>, <b style={{ color: 'var(--amber)' }}>REVIEW</b>, or <b style={{ color: 'var(--red)' }}>HOLD</b> — and tells you exactly which evidence contradicted you.</li>
          </ol>
        </section>
      )}

      {history.length > 0 && (
        <section className="panel panel-pad fadeup" style={{ marginTop: 14 }}>
          <div className="eyebrow">Recent checks</div>
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {history.map((h, i) => {
              const vv = VERDICT[h.verdict];
              return (
                <button key={`${h.at}-${i}`} type="button" className="btn-ghost" style={{ textAlign: 'left', width: '100%', borderRadius: 8, display: 'flex', gap: 10, alignItems: 'center' }}
                  onClick={() => { setText(h.text); run(h.text); }}>
                  <span style={{ color: vv ? (vv.cls === 'stamp-hold' ? 'var(--red)' : vv.cls === 'stamp-mix' ? 'var(--amber)' : 'var(--green)') : 'var(--muted)', fontWeight: 800, width: 54 }}>
                    {h.verdict === 'error' ? 'ERR' : vv ? vv.stamp : '—'}
                  </span>
                  <span className="muted" style={{ flex: 1, fontSize: 12.5 }}>{h.text}</span>
                  <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{new Date(h.at).toLocaleTimeString()}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <footer className="foot">
        <b>Preflight</b> — evidence before execution. Built for the Binance Agent OS Mini Hackathon (Track A). The verdict,
        confidence, and every number are computed deterministically by the engine; no language model decides or guesses them.
        No keys required. Replay snapshots captured from the real Binance MCP keep this demo honest even when the network is not.
      </footer>
    </main>
  );
}
