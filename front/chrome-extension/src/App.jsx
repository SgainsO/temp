import { useState, useEffect } from 'react'
import './App.css'

// ── Constants ─────────────────────────────────────────────────────────────────

const API = 'http://localhost:8787'

const RATING_CLS = {
  'Well Diversified': 'green',
  'Moderate':         'amber',
  'Concentrated':     'red',
}

const MARQUEE = [
  { sym: 'SPY', val: '+0.42%', up: true  },
  { sym: 'QQQ', val: '+0.89%', up: true  },
  { sym: 'VTI', val: '+0.31%', up: true  },
  { sym: 'BTC', val: '-1.24%', up: false },
  { sym: 'GLD', val: '+0.07%', up: true  },
  { sym: 'IWM', val: '-0.18%', up: false },
]

function sectorColor(pct) {
  if (pct >= 40) return 'linear-gradient(90deg,#ff4757,#ff6b81)'
  if (pct >= 25) return 'linear-gradient(90deg,#f5a623,#f8c471)'
  return 'linear-gradient(90deg,#00ff88,#00d4ff)'
}

function hhiCls(v) { return v > 2500 ? 'red' : v > 1500 ? 'amber' : 'green' }
function topCls(v) { return v > 40   ? 'red' : v > 25   ? 'amber' : 'green' }

// ── Main App ──────────────────────────────────────────────────────────────────

function App() {
  const [holdings, setHoldings] = useState([])

  const [divResult,  setDivResult]  = useState(null)
  const [divLoading, setDivLoading] = useState(false)
  const [divError,   setDivError]   = useState(null)

  const isLive = divResult !== null

  // auto-scrape on popup open
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { handleScrape() }, [])

  useEffect(() => {
    if (holdings.length === 0) { setDivResult(null); return }
    runDiversity(holdings)
  }, [holdings])

  // ── Scrape ───────────────────────────────────────────────────────────────
  const handleScrape = async () => {
    setDivLoading(true)
    setDivError(null)
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!activeTab.url.includes('fidelity.com')) {
        throw new Error('Navigate to a Fidelity positions page first.')
      }
      chrome.tabs.sendMessage(activeTab.id, { type: 'SCRAPE_TRADES' }, (response) => {
        if (chrome.runtime.lastError) {
          setDivError('Content script not ready — refresh the Fidelity page.')
          setDivLoading(false)
          return
        }
        if (response?.data?.length > 0) {
          setHoldings(response.data)
        } else {
          setDivError('No positions found. Open the Positions tab fully.')
          setDivLoading(false)
        }
      })
    } catch (err) {
      setDivError(err.message)
      setDivLoading(false)
    }
  }

  // ── Diversity ─────────────────────────────────────────────────────────────
  const runDiversity = async (data) => {
    setDivLoading(true)
    try {
      const resp = await fetch(`${API}/api/diversity`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ holdings: data }),
      })
      if (!resp.ok) throw new Error(`Server ${resp.status}`)
      setDivResult(await resp.json())
    } catch {
      setDivError('Backend unreachable — run: python main.py')
    } finally {
      setDivLoading(false)
    }
  }

  const ratingCls = divResult ? (RATING_CLS[divResult.metrics.rating] ?? 'gray') : null

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="terminal">
      <div className="term-inner">

        {/* Header */}
        <div className="hdr">
          <div>
            <div className="brand-name">⬡ Hackalytics v2</div>
            <div className="brand-sub">Fidelity Position Analyzer</div>
          </div>
          <div className={`hdr-status ${isLive ? 'live' : ''}`}>
            <div className={`status-dot ${isLive ? 'live' : ''}`} />
            {isLive ? 'LIVE' : 'IDLE'}
          </div>
        </div>

        {/* Ticker strip */}
        <div className="ticker-strip">
          {MARQUEE.map(({ sym, val, up }) => (
            <span key={sym} className="tick">
              {sym} <span className={up ? 'up' : 'down'}>{val}</span>
            </span>
          ))}
        </div>

        {/* ══ CONTENT ════════════════════════════════════════════════════ */}
        <>
          <>
            <button className="scan-btn" onClick={handleScrape} disabled={divLoading}>
              {divLoading
                ? <>SCANNING<span className="dot">.</span><span className="dot">.</span><span className="dot">.</span></>
                : '↺  RE-SCAN POSITIONS'}
            </button>

            {divLoading && (
              <div className="loading-row">
                <div className="spinner" />
                <span className="loading-label">Analyzing portfolio structure</span>
              </div>
            )}

            {divError && <div className="error-bar">{divError}</div>}

            {/* Rating */}
            {divResult && (
              <div className={`rating-card ${ratingCls}`}>
                <div className="rating-eyebrow">Diversification Rating</div>
                <div className={`rating-value ${ratingCls}`}>{divResult.metrics.rating}</div>
                <div className="rating-divider" />
                <div className="portfolio-value">
                  Portfolio Value&nbsp;&nbsp;
                  <span>${divResult.total_value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              </div>
            )}

            {/* Metrics */}
            {divResult && (
              <div className="metrics-grid">
                <div className="metric-card">
                  <div className="metric-label">HHI Score</div>
                  <div className={`metric-num ${hhiCls(divResult.metrics.hhi)}`}>{divResult.metrics.hhi.toLocaleString()}</div>
                  <div className="metric-sub">Concentration index</div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Eff. Sectors</div>
                  <div className="metric-num cyan">{divResult.metrics.effective_industries}</div>
                  <div className="metric-sub">Unique exposure</div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Top Weight</div>
                  <div className={`metric-num ${topCls(divResult.metrics.top_industry_weight_pct)}`}>{divResult.metrics.top_industry_weight_pct}%</div>
                  <div className="metric-sub">Largest sector</div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Entropy</div>
                  <div className="metric-num cyan">{divResult.metrics.entropy}</div>
                  <div className="metric-sub">Shannon index</div>
                </div>
              </div>
            )}

            {/* Sector breakdown */}
            {divResult?.industry_breakdown?.length > 0 && (
              <div className="sectors">
                <div className="sec-header">
                  <span className="sec-title">Sector Breakdown</span>
                  <span className="sec-badge">{divResult.industry_breakdown.length} sectors</span>
                </div>
                {divResult.industry_breakdown.map((item, i) => (
                  <div key={i} className="sector-row">
                    <div className="sector-top">
                      <span className="sector-rank">{String(i + 1).padStart(2, '0')}</span>
                      <span className="sector-name">{item.industry}</span>
                      <span className="sector-val">${(item.value / 1000).toFixed(1)}k</span>
                      <span className="sector-pct">{item.weight_pct}%</span>
                    </div>
                    <div className="bar-track">
                      <div className="bar-fill" style={{ '--bar-w': `${item.weight_pct}%`, background: sectorColor(item.weight_pct) }} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!divResult && !divLoading && (
              <div className="empty">
                <div className="empty-bars">
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
          </>
        </>

        {/* Footer */}
        <div className="footer">
          <span>Hackalytics v0.1</span>
          <span>◉ localhost:8787</span>
        </div>

      </div>
    </div>
  )
}

export default App
