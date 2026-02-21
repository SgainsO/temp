import { useState, useEffect } from 'react'
import './App.css'

const API = 'http://localhost:8787'
const SUPPORTED_BROKER_DOMAINS = ['fidelity.com', 'sofi.com']

const RATING_CLS = {
  'Well Diversified': 'green',
  'Moderate':         'amber',
  'Concentrated':     'red',
}

const TICKERS = [
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

function hhiCls(v)  { return v > 2500 ? 'red' : v > 1500 ? 'amber' : 'green' }
function topCls(v)  { return v > 40   ? 'red' : v > 25   ? 'amber' : 'green' }
function retCls(v)  { return v >= 0 ? 'green' : 'red' }

function isSupportedBrokerUrl(url) {
  return SUPPORTED_BROKER_DOMAINS.some((domain) => url.includes(domain))
}

function WeightChart({ optResult }) {
  const { tickers, weights: opt, current_weights: cur, sharpe, annual_return, annual_vol } = optResult

  const allWeights = tickers.flatMap((t) => [opt[t] ?? 0, cur[t] ?? 0])
  const maxW = Math.max(...allWeights, 0.01)

  const pct = (w) => ((w ?? 0) * 100).toFixed(1)
  const barW = (w) => `${((w ?? 0) / maxW) * 100}%`

  return (
    <>
      <div className="opt-stats">
        <div className="opt-stat-card">
          <div className="opt-stat-label">Sharpe</div>
          <div className={`opt-stat-num ${sharpe >= 1 ? 'green' : sharpe >= 0 ? 'cyan' : 'red'}`}>
            {sharpe.toFixed(2)}
          </div>
        </div>
        <div className="opt-stat-card">
          <div className="opt-stat-label">Ann. Return</div>
          <div className={`opt-stat-num ${retCls(annual_return)}`}>
            {(annual_return * 100).toFixed(1)}%
          </div>
        </div>
        <div className="opt-stat-card">
          <div className="opt-stat-label">Ann. Vol</div>
          <div className="opt-stat-num">{(annual_vol * 100).toFixed(1)}%</div>
        </div>
      </div>

      <div className="wt-chart">
        <div className="wt-chart-header">
          <span className="wt-chart-title">Recommended Weights</span>
          <div className="wt-legend">
            <span className="wt-legend-item">
              <span className="wt-legend-dot cur" /> NOW
            </span>
            <span className="wt-legend-item">
              <span className="wt-legend-dot opt" /> OPT
            </span>
          </div>
        </div>

        {tickers.map((ticker, i) => {
          const curW = cur[ticker] ?? 0
          const optW = opt[ticker] ?? 0
          const delta = (optW - curW) * 100
          const absDelta = Math.abs(delta)
          const deltaCls = absDelta < 0.05 ? 'flat' : delta > 0 ? 'up' : 'down'
          const deltaStr = absDelta < 0.05 ? '—' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`

          return (
            <div key={ticker} className="wt-row" style={{ animationDelay: `${i * 0.04}s` }}>
              <div className="wt-ticker-label">{ticker}</div>
              <div className="wt-bar-group">
                <div className="wt-bar-row">
                  <span className="wt-bar-type">NOW</span>
                  <div className="wt-track">
                    <div className="wt-fill cur" style={{ '--bar-w': barW(curW) }} />
                  </div>
                  <span className="wt-pct cur">{pct(curW)}%</span>
                  <span className="wt-delta flat" />
                </div>

                <div className="wt-bar-row">
                  <span className="wt-bar-type">OPT</span>
                  <div className="wt-track">
                    <div className="wt-fill opt" style={{ '--bar-w': barW(optW) }} />
                  </div>
                  <span className="wt-pct opt">{pct(optW)}%</span>
                  <span className={`wt-delta ${deltaCls}`}>{deltaStr}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}

function App() {
  const [tab,       setTab]       = useState('diversity')
  const [holdings,  setHoldings]  = useState([])

  const [divResult,  setDivResult]  = useState(null)
  const [divLoading, setDivLoading] = useState(false)
  const [divError,   setDivError]   = useState(null)

  const [optResult,  setOptResult]  = useState(null)
  const [optLoading, setOptLoading] = useState(false)
  const [optError,   setOptError]   = useState(null)

  const isLive = divResult !== null || optResult !== null

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { handleScrape() }, [])

  useEffect(() => {
    if (holdings.length > 0) runDiversity(holdings)
    else setDivResult(null)
  }, [holdings])

  const handleScrape = async () => {
    setDivLoading(true)
    setDivError(null)
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true })
      const url = activeTab.url || ''
      if (!isSupportedBrokerUrl(url)) {
        throw new Error('Navigate to a Fidelity or SoFi positions page first.')
      }
      chrome.tabs.sendMessage(activeTab.id, { type: 'SCRAPE_TRADES' }, (response) => {
        if (chrome.runtime.lastError) {
          setDivError('Content script not ready — refresh the Fidelity/SoFi page.')
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

  const runDiversity = async (data) => {
    setDivLoading(true)
    try {
      const resp = await fetch(`${API}/api/diversity`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ holdings: data }),
      })
      if (!resp.ok) throw new Error(`Server ${resp.status}`)
      setDivResult(await resp.json())
    } catch {
      setDivError('Backend unreachable — run: python main.py')
    } finally {
      setDivLoading(false)
    }
  }

  const handleOptimize = async () => {
    if (holdings.length === 0) {
      setOptError('Scrape positions first on the Diversity tab.')
      return
    }
    setOptLoading(true)
    setOptError(null)
    try {
      const resp = await fetch(`${API}/api/optimize-from-holdings`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ data: holdings }),
      })
      if (!resp.ok) {
        const detail = await resp.json().then((j) => j.detail).catch(() => resp.status)
        throw new Error(detail)
      }
      setOptResult(await resp.json())
    } catch (err) {
      setOptError(String(err.message ?? err))
    } finally {
      setOptLoading(false)
    }
  }

  const ratingCls = divResult ? (RATING_CLS[divResult.metrics.rating] ?? 'gray') : null

  return (
    <div className="terminal">
      <div className="term-inner">
        <div className="hdr">
          <div>
            <div className="brand-name">⬡ Hackalytics</div>
            <div className="brand-sub">Fidelity + SoFi Position Analyzer</div>
          </div>
          <div className={`hdr-status ${isLive ? 'live' : ''}`}>
            <div className={`status-dot ${isLive ? 'live' : ''}`} />
            {isLive ? 'LIVE' : 'IDLE'}
          </div>
        </div>

        <div className="ticker-strip">
          {TICKERS.map(({ sym, val, up }) => (
            <span key={sym} className="tick">
              {sym} <span className={up ? 'up' : 'down'}>{val}</span>
            </span>
          ))}
        </div>

        <div className="tabs">
          <button className={`tab-btn ${tab === 'diversity' ? 'active' : ''}`} onClick={() => setTab('diversity')}>
            ◈ Diversity
          </button>
          <button className={`tab-btn ${tab === 'optimize' ? 'active' : ''}`} onClick={() => setTab('optimize')}>
            ◉ Optimize
          </button>
        </div>

        {tab === 'diversity' && (
          <>
            <button className="scan-btn" onClick={handleScrape} disabled={divLoading}>
              {divLoading
                ? <>SCANNING<span className="dot">.</span><span className="dot">.</span><span className="dot">.</span></>
                : '↻  RE-SCAN POSITIONS'}
            </button>

            {divLoading && (
              <div className="loading-row">
                <div className="spinner" />
                <span className="loading-label">Analyzing portfolio structure</span>
              </div>
            )}

            {divError && <div className="error-bar">{divError}</div>}

            {divResult && (
              <div className={`rating-card ${ratingCls}`}>
                <div className="rating-eyebrow">Diversification Rating</div>
                <div className={`rating-value ${ratingCls}`}>{divResult.metrics.rating}</div>
                <div className="rating-divider" />
                <div className="portfolio-value">
                  Portfolio Value&nbsp;&nbsp;
                  <span>
                    ${divResult.total_value.toLocaleString(undefined, {
                      minimumFractionDigits: 2, maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
              </div>
            )}

            {divResult && (
              <div className="metrics-grid">
                <div className="metric-card">
                  <div className="metric-label">HHI Score</div>
                  <div className={`metric-num ${hhiCls(divResult.metrics.hhi)}`}>
                    {divResult.metrics.hhi.toLocaleString()}
                  </div>
                  <div className="metric-sub">Concentration index</div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Eff. Sectors</div>
                  <div className="metric-num cyan">{divResult.metrics.effective_industries}</div>
                  <div className="metric-sub">Unique exposure</div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Top Weight</div>
                  <div className={`metric-num ${topCls(divResult.metrics.top_industry_weight_pct)}`}>
                    {divResult.metrics.top_industry_weight_pct}%
                  </div>
                  <div className="metric-sub">Largest sector</div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Entropy</div>
                  <div className="metric-num cyan">{divResult.metrics.entropy}</div>
                  <div className="metric-sub">Shannon index</div>
                </div>
              </div>
            )}

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
                      <div
                        className="bar-fill"
                        style={{ '--bar-w': `${item.weight_pct}%`, background: sectorColor(item.weight_pct) }}
                      />
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
                  Open Fidelity/SoFi → Positions tab
                  <span className="cursor" />
                </div>
              </div>
            )}
          </>
        )}

        {tab === 'optimize' && (
          <>
            <button className="opt-btn" onClick={handleOptimize} disabled={optLoading}>
              {optLoading
                ? <>OPTIMIZING<span className="dot">.</span><span className="dot">.</span><span className="dot">.</span></>
                : '◉  RUN OPTIMIZER'}
            </button>

            {optLoading && (
              <div className="loading-row">
                <div className="spinner cyan" />
                <span className="loading-label cyan">Running Sharpe optimization</span>
              </div>
            )}

            {optError && <div className="error-bar">{optError}</div>}
            {optResult && <WeightChart optResult={optResult} />}

            {!optResult && !optLoading && !optError && (
              <div className="empty">
                <div className="empty-bars">
                  {[14, 32, 20, 28, 10, 24, 18].map((h, i) => (
                    <div key={i} className="empty-bar" style={{ height: `${h}px`, animationDelay: `${i * 0.12}s` }} />
                  ))}
                </div>
                <div className="empty-label">
                  {holdings.length > 0
                    ? <>Ready — click RUN OPTIMIZER<span className="cursor" /></>
                    : <>Scrape positions first on the<br />Diversity tab<span className="cursor" /></>}
                </div>
              </div>
            )}
          </>
        )}

        <div className="footer">
          <span>Hackalytics v0.1</span>
          <span>◉ localhost:8787</span>
        </div>
      </div>
    </div>
  )
}

export default App
