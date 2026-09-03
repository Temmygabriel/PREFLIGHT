'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/* ── Preflight — the pre-flight checklist for your trades ──────────────────
   A trade idea becomes an inspection docket. Each piece of evidence is a
   checklist line that fills in, then a verdict stamp lands: CLEARED / HOLD /
   GROUNDED / NO CLEARANCE. Every number is computed by the engine — no model
   decides or guesses. The example chips (and the auto-run on load) run in
   replay mode against a real captured BNB snapshot so the three showcase
   stamps are always the same; typing your own idea runs LIVE first, with
   replay as the honest fallback when the feed is unreachable.  */

const EXAMPLES = [
  { label: 'Buy BNB', text: 'Buying BNB here, feels like a breakout.' },
  { label: 'Short BNB perps', text: 'Shorting BNBUSDT perpetual, looks weak.' },
  { label: 'Sell BNB spot', text: 'BNB spot is dropping, selling my position now.' },
];

const METRIC_LABEL = {
  price_move_24h: 'Price move · 24 h',
  order_book_imbalance: 'Order book',
  volume_vs_baseline: 'Volume vs baseline',
  funding_rate: 'Funding rate',
};

// Engine evidence order (spot omits funding; futures inserts it before volume).
const CHECK_SEQUENCE = ['price_move_24h', 'order_book_imbalance', 'funding_rate', 'volume_vs_baseline'];

const VERDICT = {
  'evidence supports the idea': { stamp: 'CLEARED', cls: 'stamp-cleared', tone: 'Cleared — the evidence lines up with your idea.' },
  'evidence is mixed': { stamp: 'HOLD', cls: 'stamp-hold', tone: 'Hold — evidence points both ways. Do not commit yet.' },
  'evidence contradicts the idea': { stamp: 'GROUNDED', cls: 'stamp-grounded', tone: 'Grounded — the evidence runs against your idea. Do not act.' },
  'insufficient directional signal': { stamp: 'NO CLEARANCE', cls: 'stamp-none', tone: 'No clearance — not enough directional signal to act. Re-check before you move.' },
};

const CONF_LABEL = { High: 'HIGH', Medium: 'MEDIUM', Low: 'LOW' };
const DOCKET_KEY = 'preflight:docketno';
// Only spot <-> USDⓈ-M ever auto-resolve; mirror of the server's OTHER_MARKET.
const MARKET_KEY_LABEL = { spot: 'spot', futures_usds: 'futures (USDⓈ-M)' };
const OPPOSITE_MARKET = { spot: 'futures_usds', futures_usds: 'spot' };

function pad4(n) { return String(n).padStart(4, '0'); }
function readCounter() { try { return parseInt(localStorage.getItem(DOCKET_KEY) || '416', 10) || 416; } catch { return 416; } }
function getPendingNo() { return `PF-${pad4(readCounter() + 1)}`; }
function allocateDocketNo() { const next = readCounter() + 1; try { localStorage.setItem(DOCKET_KEY, String(next)); } catch { /* ignore */ } return `PF-${pad4(next)}`; }

function isFutures(text) { return /perp|perpetual|futures|usds/i.test(text); }
function labelFor(metric) { return METRIC_LABEL[metric] || metric.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()); }

function markFor(support) {
  if (support === 'supports') return { glyph: '✓', cls: 'm-ok', note: 'supports the idea' };
  if (support === 'contradicts') return { glyph: '✗', cls: 'm-no', note: 'contradicts the idea' };
  if (support && support.startsWith('activity:')) {
    const kind = support.slice('activity:'.length);
    if (kind === 'normal') return { glyph: '—', cls: 'm-neu', note: 'volume normal' };
    return { glyph: '△', cls: 'm-mid', note: `volume ${kind}` };
  }
  return { glyph: '—', cls: 'm-neu', note: 'neutral' };
}

function busyChecks(text) {
  const futures = isFutures(text);
  return CHECK_SEQUENCE.filter((m) => futures || m !== 'funding_rate').map(labelFor);
}

function sourceNote(result, mode) {
  const { source, liveError, brief, idea } = result;
  const at = new Date(brief.observedAt).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const tag = `${brief.symbol} ${idea.marketLabel} snapshot captured from Binance via Agent OS MCP`;
  if (source === 'live') return `Live read via Binance Agent OS MCP, observed ${at}. The engine reads and computes; no model decided this.`;
  const why = mode === 'replay'
    ? `Deterministic replay — the showcase reads the same real ${tag} every time. Type your own idea for a live read.`
    : liveError
      ? `Couldn't reach live market data — showing a replay docket instead. Real ${tag}.`
      : `No live data key set — replaying a real ${tag}.`;
  return `${why} The engine computes; no model decided this.`;
}

function fmtSupported(sup) {
  if (!Array.isArray(sup)) return '';
  const names = sup.map((s) => {
    if (typeof s === 'string') return s;
    return `${String(s.symbol || '').replace(/USDT$/, '')} (${s.market || 'spot'})`;
  }).filter(Boolean);
  return `Captured on this build: ${names.join(', ') || 'none yet'}.`;
}

export default function Page() {
  const [text, setText] = useState(EXAMPLES[0].text);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [runMode, setRunMode] = useState('auto');
  const [docketNo, setDocketNo] = useState('');
  const [history, setHistory] = useState([]);
  const [pending, setPending] = useState('');
  const autoRan = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    try {
      const h = JSON.parse(localStorage.getItem('preflight:history') || '[]');
      if (Array.isArray(h)) setHistory(h.slice(0, 8));
    } catch { /* ignore */ }
    setPending(getPendingNo());
    if (!autoRan.current) {
      autoRan.current = true;
      run(EXAMPLES[0].text, 'replay');
    }
    return () => { mounted.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pushHistory = useCallback((no, idea, res) => {
    const entry = {
      no,
      text: idea.slice(0, 64),
      base: res?.brief?.symbol || '',
      direction: res?.brief?.direction || '',
      verdict: res?.brief?.verdict || 'error',
      confidence: res?.brief?.confidence || '',
      at: Date.now(),
    };
    setHistory((prev) => {
      const next = [entry, ...prev].slice(0, 8);
      try { localStorage.setItem('preflight:history', JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const run = useCallback(async (idea, mode = 'auto') => {
    const no = allocateDocketNo();
    setDocketNo(no);
    setPending(getPendingNo());
    setBusy(true);
    setError(null);
    setResult(null);
    setRunMode(mode);
    try {
      const res = await fetch('/api/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: idea, mode }),
      });
      const data = await res.json();
      if (!mounted.current) return;
      if (!res.ok || !data.ok) {
        setError({ code: data.code || 'error', marketMissing: Boolean(data.marketMissing), symbol: data.symbol || '', message: data.message || 'Preflight could not complete the check.', supported: data.supported });
        pushHistory(no, idea, null);
        setBusy(false);
        return;
      }
      setResult(data);
      pushHistory(no, idea, data);
      setBusy(false);
    } catch (e) {
      if (!mounted.current) return;
      setError({ code: 'network', marketMissing: false, message: 'Network error — could not reach the Preflight API.' });
      pushHistory(no, idea, null);
      setBusy(false);
    }
  }, [pushHistory]);

  const v = result ? (VERDICT[result.brief.verdict] || VERDICT['insufficient directional signal']) : null;
  const evidence = result ? result.brief.evidence : [];
  const rowMs = 420;
  const stampDelay = evidence.length * rowMs + 140;

  return (
    <main className="wrap">
      {/* masthead */}
      <header className="mast fadeup">
        <div>
          <div className="wordmark">Preflight</div>
          <div className="sub-mark">verify before you act</div>
        </div>
        <div className="mast-meta mono">BINANCE AGENT OS<br />TRACK A · AGENT CREATION</div>
      </header>

      <p className="lede fadeup">
        The pre-flight checklist for your trades. Before an agent moves your money, Preflight
        reads the market and stamps a verdict — <b>computed in code, never guessed.</b>
      </p>

      {/* ── input docket ── */}
      <section className="docket fadeup">
        <div className="docket-head">
          <div className="docket-id mono">DOCKET <span className="mono">{pending || docketNo}</span></div>
          <div className="docket-status">Unfiled</div>
        </div>
        <label className="field-label" htmlFor="idea">Trade idea</label>
        <textarea
          id="idea"
          className="idea-input"
          style={{ minHeight: 84 }}
          value={text}
          placeholder='Describe the move you want to make — e.g. "Buying BNB, breaking out".'
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') run(text); }}
        />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {EXAMPLES.map((ex) => (
              <button key={ex.label} type="button" className="chip-btn" disabled={busy} onClick={() => { setText(ex.text); run(ex.text, 'replay'); }}>
                {ex.label}
              </button>
            ))}
          </div>
          <button type="button" className="btn" disabled={busy || !text.trim()} onClick={() => run(text)}>
            {busy ? 'Running Preflight check…' : 'Run Preflight Check'}
          </button>
        </div>
      </section>

      {/* ── busy docket ── */}
      {busy && (
        <section className="docket fadeup">
          <div className="docket-head">
            <div className="docket-id mono">DOCKET <span className="mono">{docketNo || pending}</span></div>
            <div className="docket-status docket-status-run">In progress</div>
          </div>
          <div className="docket-meta"><span className="mono">Reading market snapshot…</span></div>
          <div>
            {busyChecks(text).map((name, i) => (
              <div className="check-row" key={name}>
                <span className="check-num">{i + 1}</span>
                <span className="check-name">{name}</span>
                <span className="check-state pulse">checking…</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── error docket ── */}
      {error && !busy && (
        <section className="docket fadeup">
          <div className="docket-head">
            <div className="docket-id mono">DOCKET <span className="mono">{docketNo}</span></div>
            <div className="docket-status docket-status-stop">No clearance</div>
          </div>
          <div className="err-title">Preflight could not run that check.</div>
          <div className="err-msg">{error.message}</div>
          {error.code === 'live_failed' && error.marketMissing && (
            <div className="err-supp mono">Preflight already tried both spot and futures — Binance reports no {error.symbol || 'this pair'} market. Double-check the ticker (spell the exact symbol, e.g. “HYPEUSDT”).</div>
          )}
          {error.code === 'live_failed' && !error.marketMissing && (
            <div className="err-supp mono">The live feed could not be read right now. Re-run the check, or click the example chips — those replay real captured snapshots and always work.</div>
          )}
          {error.supported && error.code !== 'live_failed' && error.code !== 'network' && (
            <div className="err-supp mono">{fmtSupported(error.supported)}</div>
          )}
        </section>
      )}

      {/* ── result docket ── */}
      {result && v && !busy && (
        <section key={docketNo} className="docket fadeup">
          <div className="docket-head">
            <div className="docket-id mono">DOCKET <span className="mono">{docketNo}</span></div>
            <div className={`docket-status ${result.source === 'live' ? 'docket-status-go' : ''}`}>Inspected</div>
          </div>

          <div className="docket-meta">
            <span className="mono">
              <b>{result.brief.symbol}</b> · {result.idea.marketLabel} ·{' '}
              <b style={{ color: result.brief.direction === 'sell' ? 'var(--grounded)' : 'var(--cleared)' }}>
                {result.brief.direction.toUpperCase()}
              </b>
            </span>
            <span className={result.source === 'live' ? 'src-live' : 'src-replay'}>
              {result.source === 'live' ? '● LIVE' : '◌ REPLAYED'}
            </span>
          </div>

          {result.autoMarket && (
            <div className="auto-note mono">
              No {MARKET_KEY_LABEL[OPPOSITE_MARKET[result.idea.market]] || 'other'} pair on Binance — Preflight read {result.idea.marketLabel} instead.
            </div>
          )}

          {/* checklist */}
          <div>
            {evidence.map((e, i) => {
              const m = markFor(e.support);
              return (
                <div className="check-row resolve" key={e.metric} style={{ animationDelay: `${i * rowMs}ms` }}>
                  <span className="check-num">{i + 1}</span>
                  <span className="check-name">{labelFor(e.metric)}</span>
                  <span className="val-col">
                    <span className="val">{e.result}</span>
                    <span className="support-note">{m.note}</span>
                  </span>
                  <span className={`mark ${m.cls}`}>{m.glyph}</span>
                </div>
              );
            })}
          </div>

          {/* contradiction flag */}
          {result.brief.contradiction.flag && (
            <div className="flag">
              <b>Contradiction flagged —</b> {result.brief.contradiction.detail}
            </div>
          )}

          {/* verdict + stamp */}
          <div className="verdict">
            <div className="verdict-copy">
              <div className="tone">{v.tone}</div>
              <div className="fact mono">
                Confidence <b>{CONF_LABEL[result.brief.confidence] || result.brief.confidence}</b> — computed by code, never guessed.
                <br />
                {result.brief.confidenceBreakdown.agree} agree · {result.brief.confidenceBreakdown.neutral} neutral ·{' '}
                {result.brief.confidenceBreakdown.disagree} disagree of {evidence.length} checks
              </div>
            </div>
            <div className="stamp-wrap">
              <div
                className={`stamp ${v.cls} ${v.stamp.length > 9 ? 'stamp-long ' : ''}land`}
                style={{ animationDelay: `${stampDelay}ms` }}
              >
                {v.stamp}
              </div>
              <span className="stamp-cap mono">stamped {new Date(result.brief.computedAt).toLocaleTimeString()}</span>
            </div>
          </div>

          {/* plain-language brief */}
          <div className="explain">
            <span className="field-label">Inspection brief</span>
            <p>{result.explanation.text}</p>
          </div>

          <div className="docket-note mono">{sourceNote(result, runMode)}</div>
        </section>
      )}

      {/* ── how it works (idle) ── */}
      {!busy && !result && !error && (
        <section className="pitch fadeup">
          <div className="pitch-title">The 10-second pitch</div>
          <ol>
            <li><span className="n mono">1</span><span>You state a trade idea in plain language — as you would to an agent.</span></li>
            <li><span className="n mono">2</span><span>Preflight reads the market and runs four deterministic checks: <b>price trend, order book, volume, funding</b>.</span></li>
            <li><span className="n mono">3</span><span>It stamps <b style={{ color: 'var(--on-dark)' }}>CLEARED</b>, <b style={{ color: 'var(--hold-dark)' }}>HOLD</b>, or <b style={{ color: 'var(--grounded-dark)' }}>GROUNDED</b> — and tells you which evidence contradicted you.</span></li>
          </ol>
        </section>
      )}

      {/* ── logbook ── */}
      {history.length > 0 && (
        <section className="ledger-sec fadeup">
          <div className="ledger-title">Logbook</div>
          <div>
            {history.map((h, i) => {
              const vv = VERDICT[h.verdict];
              const stampWord = h.verdict === 'error' ? 'ERR' : vv ? vv.stamp : '—';
              const cls = !vv ? 'v-none' : vv.stamp === 'CLEARED' ? 'v-clear' : vv.stamp === 'HOLD' ? 'v-hold' : vv.stamp === 'GROUNDED' ? 'v-grounded' : 'v-none';
              return (
                <button key={`${h.no || h.at}-${i}`} type="button" className="ledger-row"
                  onClick={() => { setText(h.text); run(h.text); }}>
                  <span className="l-no">{h.no || 'PF-····'}</span>
                  <span className="l-idea">{h.base} · {h.text}</span>
                  <span className="l-time">{new Date(h.at).toLocaleTimeString()}</span>
                  <span className={`l-v ${cls}`}>{stampWord}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <footer className="foot">
        <b>Preflight</b> — evidence before execution. Built for the Binance Agent OS Mini Hackathon
        (Track A). The verdict, confidence, and every number are computed deterministically by the
        engine; no language model decides or guesses them. No keys required — replay snapshots
        captured from the real Binance MCP keep the demo honest even when the network is not.
      </footer>
    </main>
  );
}
