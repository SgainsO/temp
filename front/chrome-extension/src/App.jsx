import { useState, useEffect } from 'react'
import './App.css'

const RATING_CLASS = {
  'Well Diversified': 'green',
  'Moderate':         'amber',
  'Concentrated':     'red',
  'No Data':          'gray',
}

function barColor(pct) {
  if (pct >= 40) return 'linear-gradient(90deg, #ff4757 0%, #ff6b81 100%)'
  if (pct >= 25) return 'linear-gradient(90deg, #f5a623 0%, #f8c471 100%)'
  return 'linear-gradient(90deg, #00ff88 0%, #00d4ff 100%)'
}

function hhiColor(hhi) {
  if (hhi > 2500) return 'red'
  if (hhi > 1500) return 'amber'
  return 'green'
}

function topColor(pct) {
  if (pct > 40) return 'red'
  if (pct > 25) return 'amber'
  return 'green'
}

const TICKERS = [
  { sym: 'SPY',  val: '+0.42%', up: true  },
  { sym: 'QQQ',  val: '+0.89%', up: true  },
  { sym: 'VTI',  val: '+0.31%', up: true  },
  { sym: 'BTC',  val: '-1.24%', up: false },
  { sym: 'GLD',  val: '+0.07%', up: true  },
  { sym: 'IWM',  val: '-0.18%', up: false },
]

function App() {
  const [holdings, setHoldings] = useState([])
  const [result,   setResult]   = useState(null)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)

  useEffect(() => {
    if (holdings.length > 0) sendToPythonBackend(holdings)
    else setResult(null)
  }, [holdings])

  const handleScrape = async () => {
    setLoading(true)
    setError(null)
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab.url.includes('fidelity.com')) {
        throw new Error('Navigate to a Fidelity positions page first.')
      }
      chrome.tabs.sendMessage(tab.id, { type: 'SCRAPE_TRADES' }, (response) => {
        if (chrome.runtime.lastError) {
          setError('Content script not ready — refresh the Fidelity page.')
          setLoading(false)
          return
        }
        if (response?.data?.length > 0) {
          setHoldings(response.data)
        } else {
          setError('No positions found. Open the Positions tab fully.')
          setLoading(false)
        }
      })
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  const sendToPythonBackend = async (data) => {
    setLoading(true)
    try {
      const resp = await fetch('http://localhost:8787/api/diversity', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ holdings: data }),
      })
      if (!resp.ok) throw new Error(`Server ${resp.status}`)
      setResult(await resp.json())
    } catch {
      setError('Backend unreachable — run: python main.py')
    } finally {
      setLoading(false)
    }
  }

  const cls = result ? (RATING_CLASS[result.metrics.rating] ?? 'gray') : null

  return (
    <div className="terminal">

      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="hdr">
        <div className="hdr-brand">
          <div className="brand-name">
            <span className="brand-hex">⬡ </span>HACKALYTICS
          </div>
          <div className="brand-sub">Fidelity Position Analyzer</div>
        </div>
        <div className={`hdr-status ${result ? 'live' : ''}`}>
          <div className={`status-dot ${result ? 'live' : ''}`} />
          {result ? 'LIVE' : 'IDLE'}
        </div>
      </div>

      {/* ── Decorative Ticker Strip ───────────────────────────────────── */}
      <div className="ticker-strip">
        {TICKERS.map(({ sym, val, up }) => (
          <span key={sym} className="tick">
            {sym} <span className={up ? 'up' : 'down'}>{val}</span>
          </span>
        ))}
      </div>

      {/* ── Scan Button ──────────────────────────────────────────────── */}
      <button className="scan-btn" onClick={handleScrape} disabled={loading}>
        {loading
          ? <>SCANNING<span className="dot">.</span><span className="dot">.</span><span className="dot">.</span></>
          : '▶  SCAN POSITIONS'}
      </button>

      {/* ── Loading Indicator ─────────────────────────────────────────── */}
      {loading && (
        <div className="loading-row">
          <div className="spinner" />
          <span className="loading-label">Analyzing portfolio structure</span>
        </div>
      )}

      {/* ── Error ────────────────────────────────────────────────────── */}
      {error && <div className="error-bar">{error}</div>}

      {/* ── Rating Card ──────────────────────────────────────────────── */}
      {result && (
        <div className={`rating-card ${cls}`}>
          <div className="rating-eyebrow">Diversification Rating</div>
          <div className={`rating-value ${cls}`}>{result.metrics.rating}</div>
          <div className="rating-divider" />
          <div className="portfolio-value">
            Portfolio Value&nbsp;&nbsp;
            <span>
              ${result.total_value.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </div>
        </div>
      )}

      {/* ── Metrics Grid ─────────────────────────────────────────────── */}
      {result && (
        <div className="metrics-grid">
          <div className="metric-card">
            <div className="metric-label">HHI Score</div>
            <div className={`metric-num ${hhiColor(result.metrics.hhi)}`}>
              {result.metrics.hhi.toLocaleString()}
            </div>
            <div className="metric-sub">Concentration index</div>
          </div>

          <div className="metric-card">
            <div className="metric-label">Eff. Sectors</div>
            <div className="metric-num cyan">
              {result.metrics.effective_industries}
            </div>
            <div className="metric-sub">Unique exposure</div>
          </div>

          <div className="metric-card">
            <div className="metric-label">Top Weight</div>
            <div className={`metric-num ${topColor(result.metrics.top_industry_weight_pct)}`}>
              {result.metrics.top_industry_weight_pct}%
            </div>
            <div className="metric-sub">Largest sector</div>
          </div>

          <div className="metric-card">
            <div className="metric-label">Entropy</div>
            <div className="metric-num cyan">
              {result.metrics.entropy}
            </div>
            <div className="metric-sub">Shannon index</div>
          </div>
        </div>
      )}

      {/* ── Sector Breakdown ─────────────────────────────────────────── */}
      {result?.industry_breakdown?.length > 0 && (
        <div className="sectors">
          <div className="sec-header">
            <span className="sec-title">Sector Breakdown</span>
            <span className="sec-count">{result.industry_breakdown.length} sectors</span>
          </div>

          {result.industry_breakdown.map((item, i) => (
            <div key={i} className="sector-row">
              <div className="sector-top">
                <span className="sector-rank">{String(i + 1).padStart(2, '0')}</span>
                <span className="sector-name">{item.industry}</span>
                <span className="sector-val">
                  ${(item.value / 1000).toFixed(1)}k
                </span>
                <span className="sector-pct">{item.weight_pct}%</span>
              </div>
              <div className="bar-track">
                <div
                  className="bar-fill"
                  style={{
                    '--w': `${item.weight_pct}%`,
                    background: barColor(item.weight_pct),
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Empty State ──────────────────────────────────────────────── */}
      {!result && !loading && (
        <div className="empty">
          <div className="empty-chart">
            {[18, 28, 22, 35, 14].map((h, i) => (
              <div key={i} className="empty-bar" style={{ height: `${h}px`, animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
          <div className="empty-label">
            Awaiting position data<br />
            Open Fidelity → Positions tab
            <span className="cursor" />
          </div>
        </div>
      )}

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <div className="footer">
        <span>Hackalytics v0.1</span>
        <span>◉ localhost:8787</span>
      </div>

    </div>
  )
}

export default App
