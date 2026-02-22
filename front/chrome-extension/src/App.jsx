import { useState, useEffect, useMemo } from 'react'
import './App.css'

// ── Constants ─────────────────────────────────────────────────────────────────

const API = 'http://localhost:8787'

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

function hhiVerdict(v) {
  if (v < 1500) return 'Eggs in many baskets'
  if (v < 2500) return 'Getting concentrated'
  return 'Too much in one area'
}
function topVerdict(v) {
  if (v > 40) return 'Nearly half in one sector'
  if (v > 25) return 'One sector dominates — watch it'
  return 'No single sector dominates'
}
function balanceGrade(entropy) {
  if (entropy > 1.8) return { word: 'Great',  cls: 'green' }
  if (entropy > 1.0) return { word: 'Fair',   cls: 'amber' }
  return                     { word: 'Poor',   cls: 'red'   }
}
function sharpeVerdict(s) {
  if (s >= 1.5) return 'Excellent risk / reward'
  if (s >= 1.0) return 'Good risk / reward'
  if (s >= 0.5) return 'Decent — room to improve'
  if (s >= 0)   return 'Low return for the risk'
  return 'Losing ground on risk'
}

function signed(delta, digits = 2) {
  const n = Number(delta || 0)
  const prefix = n > 0 ? '+' : ''
  return `${prefix}${n.toFixed(digits)}`
}

function topHoldingPct(valueByTicker) {
  const values = Object.values(valueByTicker || {}).map((v) => Number(v || 0)).filter((v) => v > 0)
  if (values.length === 0) return 0
  const total = values.reduce((a, b) => a + b, 0)
  const top = Math.max(...values)
  return total > 0 ? (top / total) * 100 : 0
}

function avgPortfolioVol(volResult) {
  const metrics = volResult?.volatility_analysis?.annualized_volatility || {}
  const vols = Object.values(metrics)
    .map((m) => Number(m?.vol20))
    .filter((v) => Number.isFinite(v) && v > 0)
  if (vols.length === 0) return null
  return vols.reduce((a, b) => a + b, 0) / vols.length
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v))
}

function scoreFromConcentration(hhi) {
  if (!Number.isFinite(hhi)) return null
  return clamp(100 - (hhi / 10000) * 100, 0, 100)
}

function scoreFromDiversification(entropy) {
  if (!Number.isFinite(entropy)) return null
  return clamp((entropy / 2.4) * 100, 0, 100)
}

function scoreFromVolatility(avgVol) {
  if (!Number.isFinite(avgVol)) return null
  const pct = avgVol * 100
  return clamp(100 - ((pct - 10) / 40) * 100, 0, 100)
}

function scoreFromSharpe(sharpe) {
  if (!Number.isFinite(sharpe)) return null
  return clamp(((sharpe + 0.5) / 2.5) * 100, 0, 100)
}

function portfolioHealthIndex({ hhi, entropy, avgVol, sharpe }) {
  const parts = [
    { w: 0.4, v: scoreFromConcentration(hhi) },
    { w: 0.25, v: scoreFromDiversification(entropy) },
    { w: 0.2, v: scoreFromVolatility(avgVol) },
    { w: 0.15, v: scoreFromSharpe(sharpe) },
  ].filter((p) => p.v != null)

  if (parts.length === 0) return null
  const weightSum = parts.reduce((s, p) => s + p.w, 0)
  const weighted = parts.reduce((s, p) => s + p.v * p.w, 0) / (weightSum || 1)
  return Math.round(weighted)
}

function healthCls(score) {
  if (score == null) return 'gray'
  if (score >= 70) return 'green'
  if (score >= 50) return 'amber'
  return 'red'
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

function Tip({ text, children }) {
  const [show, setShow] = useState(false)
  return (
    <span className="tip-wrap"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}>
      {children}
      {show && <span className="tip-box">{text}</span>}
    </span>
  )
}

function HealthGauge({ label, score }) {
  const cls = healthCls(score)
  const safeScore = clamp(Number(score ?? 0), 0, 100)
  const [animatedScore, setAnimatedScore] = useState(0)

  useEffect(() => {
    setAnimatedScore(0)
    const raf = requestAnimationFrame(() => setAnimatedScore(safeScore))
    return () => cancelAnimationFrame(raf)
  }, [safeScore])

  const arcRadius = 70
  const arcLen = Math.PI * arcRadius
  const dashOffset = arcLen * (1 - animatedScore / 100)
  return (
    <div className="health-gauge-card">
      <div className="health-gauge-label">{label}</div>
      <div className={`health-gauge ${cls}`}>
        <svg viewBox="0 0 160 90" className="health-gauge-svg" aria-hidden="true">
          <path
            className="health-gauge-track"
            d="M 10 80 A 70 70 0 0 1 150 80"
          />
          <path
            className={`health-gauge-progress ${cls}`}
            d="M 10 80 A 70 70 0 0 1 150 80"
            style={{ strokeDasharray: arcLen, strokeDashoffset: dashOffset }}
          />
        </svg>
        <div className="health-gauge-center">
          <div className={`health-gauge-score ${cls}`}>{score == null ? '--' : Math.round(animatedScore)}</div>
          <div className="health-gauge-outof">/100</div>
        </div>
      </div>
    </div>
  )
}

// ── Optimize Chart Component ───────────────────────────────────────────────────

function WeightChart({ optResult, period }) {
  const { tickers, weights: opt, current_weights: cur,
          sharpe, annual_return, annual_vol } = optResult
  const periodLabel = period ? period.replace('y', period === '1y' ? ' year' : ' years') : '5 years'

  const allWeights = tickers.flatMap(t => [opt[t] ?? 0, cur[t] ?? 0])
  const maxW = Math.max(...allWeights, 0.01)

  const pct  = (w) => ((w ?? 0) * 100).toFixed(1)
  const barW = (w) => `${((w ?? 0) / maxW) * 100}%`

  return (
    <>
      {/* Plain-English summary */}
      <div className="opt-summary">
        Based on {periodLabel} of price history, here is how shifting your holdings
        could improve your returns relative to the risk you take.
      </div>

      {/* Stats row */}
      <div className="opt-stats">
        <div className="opt-stat-card">
          <div className="opt-stat-label">
            <Tip text="How much return you're getting for the risk you take. Above 1.0 is solid — like getting a fair wage for hard work. Below 0.5 means you're risking a lot for little reward.">Quality Score</Tip>
          </div>
          <div className={`opt-stat-num ${sharpe >= 1 ? 'green' : sharpe >= 0.5 ? 'cyan' : 'red'}`}>
            {sharpe.toFixed(2)}
          </div>
          <div className="opt-stat-sub">{sharpeVerdict(sharpe)}</div>
        </div>
        <div className="opt-stat-card">
          <div className="opt-stat-label">
            <Tip text="A rough estimate of how much your portfolio might grow in a year, based on past prices. It's not a guarantee — the future can always surprise you.">Expected Gain / Year</Tip>
          </div>
          <div className={`opt-stat-num ${retCls(annual_return)}`}>
            {annual_return >= 0 ? '+' : ''}{(annual_return * 100).toFixed(1)}%
          </div>
          <div className="opt-stat-sub">If history repeats</div>
        </div>
        <div className="opt-stat-card">
          <div className="opt-stat-label">
            <Tip text="How much your portfolio value might go up or down over a year. A 20% swing on $10,000 means it could change by $2,000 in either direction — totally normal, not necessarily bad.">Expected Swings</Tip>
          </div>
          <div className="opt-stat-num">{(annual_vol * 100).toFixed(1)}%</div>
          <div className="opt-stat-sub">How much it may move yearly</div>
        </div>
      </div>

      {/* Bar chart */}
      <div className="wt-chart">
        <div className="wt-chart-header">
          <span className="wt-chart-title">How to Rebalance</span>
          <div className="wt-legend">
            <span className="wt-legend-item">
              <span className="wt-legend-dot cur" /> You have
            </span>
            <span className="wt-legend-item">
              <span className="wt-legend-dot opt" /> Suggested
            </span>
          </div>
        </div>

        {tickers.map((ticker, i) => {
          const curW = cur[ticker] ?? 0
          const optW = opt[ticker] ?? 0
          const delta = (optW - curW) * 100
          const absDelta = Math.abs(delta)
          const deltaCls = absDelta < 0.05 ? 'flat' : delta > 0 ? 'up' : 'down'
          const deltaStr = absDelta < 0.05
            ? 'no change'
            : delta > 0
              ? `▲ add ${delta.toFixed(1)}%`
              : `▼ cut ${(-delta).toFixed(1)}%`

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
                  <span className="wt-bar-type">GOAL</span>
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

// ── Main App ──────────────────────────────────────────────────────────────────

function App() {
  const [tab,      setTab]      = useState('diversity')
  const [holdings, setHoldings] = useState([])
  const [zoom, setZoom] = useState(() => Number(localStorage.getItem('safeplay-zoom')) || 1)

  const changeZoom = (delta) => {
    setZoom(prev => {
      const next = Math.round(Math.min(1.5, Math.max(0.7, prev + delta)) * 10) / 10
      localStorage.setItem('safeplay-zoom', next)
      return next
    })
  }

  useEffect(() => {
    document.body.style.zoom = zoom
  }, [zoom])

  useEffect(() => {
    const onKey = (e) => {
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === '+') changeZoom(0.1)
      else if (e.key === '-') changeZoom(-0.1)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const [divResult,      setDivResult]      = useState(null)
  const [divLoading,     setDivLoading]     = useState(false)
  const [divError,       setDivError]       = useState(null)
  const [expandedSector, setExpandedSector] = useState(null)
  const [hideUnknown,    setHideUnknown]    = useState(false)

  const [optResult,  setOptResult]  = useState(null)
  const [optLoading, setOptLoading] = useState(false)
  const [optError,   setOptError]   = useState(null)
  const [optPeriod,  setOptPeriod]  = useState('5y')

  const [stockOptions, setStockOptions] = useState([])
  const [stockLoading, setStockLoading] = useState(false)
  const [stockError, setStockError] = useState(null)
  const [stockQuery, setStockQuery] = useState('')
  const [selectedSymbol, setSelectedSymbol] = useState('')
  const [testValue, setTestValue] = useState('500')
  const [testResult, setTestResult] = useState(null)
  const [testLoading, setTestLoading] = useState(false)
  const [testError, setTestError] = useState(null)
  const [showDropdown, setShowDropdown] = useState(false)

  const isLive = divResult !== null || optResult !== null || testResult !== null

  useEffect(() => { handleScrape() }, [])
  useEffect(() => { loadStockChoices() }, [])

  useEffect(() => {
    if (holdings.length > 0) runDiversity(holdings, hideUnknown)
    else setDivResult(null)
  }, [holdings])

  const filteredStocks = useMemo(() => {
    const q = stockQuery.trim().toLowerCase()
    if (!q) return stockOptions.slice(0, 50)
    return stockOptions.filter((stock) =>
      stock.symbol.toLowerCase().includes(q) ||
      stock.name.toLowerCase().includes(q) ||
      stock.sector.toLowerCase().includes(q)
    ).slice(0, 50)
  }, [stockOptions, stockQuery])

  useEffect(() => {
    if (!selectedSymbol && filteredStocks.length > 0) {
      setSelectedSymbol(filteredStocks[0].symbol)
    }
  }, [filteredStocks, selectedSymbol])

  // ── Scrape ───────────────────────────────────────────────────────────────
  const handleScrape = async () => {
    setDivLoading(true)
    setDivError(null)
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true })
      const url = activeTab.url || ''
      if (!url.includes('fidelity.com') && !url.includes('sofi.com')) {
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

  // ── Diversity API ─────────────────────────────────────────────────────────
  const runDiversity = async (data, hide_unknown = false) => {
    setDivLoading(true)
    try {
      const resp = await fetch(`${API}/api/diversity`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ holdings: data, hide_unknown }),
      })
      if (!resp.ok) throw new Error(`Server ${resp.status}`)
      setDivResult(await resp.json())
    } catch {
      setDivError('Backend unreachable — run: python main.py')
    } finally {
      setDivLoading(false)
    }
  }

  // ── Stock list API ────────────────────────────────────────────────────────
  const loadStockChoices = async () => {
    setStockLoading(true)
    setStockError(null)
    try {
      const resp = await fetch(`${API}/api/stocks?limit=700`)
      if (!resp.ok) throw new Error(`Server ${resp.status}`)
      const payload = await resp.json()
      setStockOptions(payload ?? [])
    } catch {
      setStockError('Could not load stock list from backend.')
    } finally {
      setStockLoading(false)
    }
  }

  // ── Optimize API ──────────────────────────────────────────────────────────
  const handleOptimize = async () => {
    if (holdings.length === 0) {
      setOptError('Scan your positions first on the Overview tab.')
      return
    }
    setOptLoading(true)
    setOptError(null)
    try {
      const resp = await fetch(`${API}/api/optimize-from-holdings`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ data: holdings, period: optPeriod }),
      })
      if (!resp.ok) {
        const detail = await resp.json().then(j => j.detail).catch(() => resp.status)
        throw new Error(detail)
      }
      setOptResult(await resp.json())
    } catch (err) {
      setOptError(String(err.message ?? err))
    } finally {
      setOptLoading(false)
    }
  }

  // ── Test Stock API ────────────────────────────────────────────────────────
  const handleTestStock = async () => {
    if (holdings.length === 0) {
      setTestError('Scan your positions first on the Overview tab.')
      return
    }
    if (!selectedSymbol) {
      setTestError('Pick a stock symbol first.')
      return
    }
    const parsedValue = Number(testValue)
    if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
      setTestError('Enter a valid dollar amount greater than 0.')
      return
    }

    setTestLoading(true)
    setTestError(null)
    try {
      const resp = await fetch(`${API}/api/simulate-add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          holdings,
          added_symbol: selectedSymbol,
          added_value: parsedValue,
          period: '1y',
        }),
      })
      if (!resp.ok) {
        const detail = await resp.json().then((j) => j.detail).catch(() => resp.status)
        throw new Error(detail)
      }
      setTestResult(await resp.json())
    } catch (err) {
      setTestError(String(err.message ?? err))
    } finally {
      setTestLoading(false)
    }
  }

  const ratingCls = divResult ? (RATING_CLS[divResult.metrics.rating] ?? 'gray') : null
  const baseDiv = testResult?.baseline?.diversity?.metrics
  const simDiv = testResult?.simulated?.diversity?.metrics
  const hhiDelta = (simDiv?.hhi ?? 0) - (baseDiv?.hhi ?? 0)
  const topDelta = (simDiv?.top_industry_weight_pct ?? 0) - (baseDiv?.top_industry_weight_pct ?? 0)
  const entropyDelta = (simDiv?.entropy ?? 0) - (baseDiv?.entropy ?? 0)
  const effectiveDelta = (simDiv?.effective_industries ?? 0) - (baseDiv?.effective_industries ?? 0)

  const baseTopHoldingPct = topHoldingPct(testResult?.baseline?.value_by_ticker)
  const simTopHoldingPct = topHoldingPct(testResult?.simulated?.value_by_ticker)

  const baseAvgVol = avgPortfolioVol(testResult?.baseline?.volatility)
  const simAvgVol = avgPortfolioVol(testResult?.simulated?.volatility)
  const volDelta = (simAvgVol ?? 0) - (baseAvgVol ?? 0)

  const divStatus = topDelta > 0.00001
    ? { word: 'Worse', cls: 'red' }
    : (hhiDelta < -0.00001 || effectiveDelta > 0.00001)
      ? { word: 'Improved', cls: 'green' }
      : { word: 'Neutral', cls: 'amber' }

  const volStatus = (simAvgVol == null || baseAvgVol == null)
    ? { word: 'Unknown', cls: 'gray' }
    : volDelta > 0.00001
      ? { word: 'Higher', cls: 'red' }
      : volDelta < -0.00001
        ? { word: 'Lower', cls: 'green' }
        : { word: 'Neutral', cls: 'amber' }

  const baseOpt = testResult?.baseline?.optimize
  const simOpt = testResult?.simulated?.optimize
  const optUnavailable = Boolean(baseOpt?.error || simOpt?.error)
  const baseSharpe = Number(baseOpt?.sharpe ?? 0)
  const simSharpe = Number(simOpt?.sharpe ?? 0)
  const sharpeDelta = simSharpe - baseSharpe
  const sharpeStatus = optUnavailable
    ? { word: 'Unknown', cls: 'gray' }
    : sharpeDelta > 0.001
      ? { word: 'Higher', cls: 'green' }
      : sharpeDelta < -0.001
        ? { word: 'Lower', cls: 'red' }
        : { word: 'Neutral', cls: 'amber' }
  const baseTop3 = Object.entries(baseOpt?.weights || {}).sort((a, b) => b[1] - a[1]).slice(0, 3)
  const simTop3 = Object.entries(simOpt?.weights || {}).sort((a, b) => b[1] - a[1]).slice(0, 3)
  const optChanged = !optUnavailable && (
    Math.abs(simSharpe - baseSharpe) > 0.001 ||
    JSON.stringify(baseTop3.map(([t, w]) => [t, Number(w).toFixed(3)])) !==
      JSON.stringify(simTop3.map(([t, w]) => [t, Number(w).toFixed(3)]))
  )

  const baseHealth = portfolioHealthIndex({
    hhi: baseDiv?.hhi,
    entropy: baseDiv?.entropy,
    avgVol: baseAvgVol,
    sharpe: optUnavailable ? null : baseSharpe,
  })
  const simHealth = portfolioHealthIndex({
    hhi: simDiv?.hhi,
    entropy: simDiv?.entropy,
    avgVol: simAvgVol,
    sharpe: optUnavailable ? null : simSharpe,
  })
  const healthDelta = (simHealth ?? 0) - (baseHealth ?? 0)

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="terminal">
      <div className="term-inner">

        {/* Header */}
        <div className="hdr">
          <div>
            <div className="brand-name">⬡ Safeplay</div>
            <div className="brand-sub">Saftey Position Analyzer</div>
          </div>
          <div className="hdr-right">
            <div className="zoom-controls">
              <button className="zoom-btn" onClick={() => changeZoom(-0.1)}>−</button>
              <span className="zoom-label">{Math.round(zoom * 100)}%</span>
              <button className="zoom-btn" onClick={() => changeZoom(0.1)}>+</button>
            </div>
            <div className={`hdr-status ${isLive ? 'live' : ''}`}>
              <div className={`status-dot ${isLive ? 'live' : ''}`} />
              {isLive ? 'LIVE' : 'IDLE'}
            </div>
          </div>
        </div>

        {/* Ticker strip */}
        <div className="ticker-strip">
          {TICKERS.map(({ sym, val, up }) => (
            <span key={sym} className="tick">
              {sym} <span className={up ? 'up' : 'down'}>{val}</span>
            </span>
          ))}
        </div>

        {/* Tabs */}
        <div className="tabs">
          <button className={`tab-btn ${tab === 'diversity' ? 'active' : ''}`}
                  onClick={() => setTab('diversity')}>
            ◈ Overview
          </button>
          <button className={`tab-btn ${tab === 'optimize' ? 'active' : ''}`}
                  onClick={() => setTab('optimize')}>
            ◎ Rebalance
          </button>
          <button className={`tab-btn ${tab === 'test-stock' ? 'active' : ''}`}
                  onClick={() => setTab('test-stock')}>
            ◌ Test Stock
          </button>
        </div>

        {/* ══ OVERVIEW TAB ═══════════════════════════════════════════════ */}
        {tab === 'diversity' && (
          <>
            <button className="scan-btn" onClick={handleScrape} disabled={divLoading}>
              {divLoading
                ? <>SCANNING<span className="dot">.</span><span className="dot">.</span><span className="dot">.</span></>
                : '↺  RE-SCAN POSITIONS'}
            </button>

            {divLoading && (
              <div className="loading-row">
                <div className="spinner" />
                <span className="loading-label">Reading your positions</span>
              </div>
            )}

            {divError && <div className="error-bar">{divError}</div>}

            {divResult && (
              <div className={`rating-card ${ratingCls}`}>
                <div className="rating-eyebrow">Overall Health</div>
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

            {divResult && (() => {
              const balance = balanceGrade(divResult.metrics.entropy)
              return (
                <div className="metrics-grid">
                  <div className="metric-card">
                    <div className="metric-label">
                      <Tip text="Think of this as 'eggs in one basket.' Under 1,500 = money spread across many areas (safer). Over 2,500 = most of your money is in a few places (riskier).">Concentration</Tip>
                    </div>
                    <div className={`metric-num ${hhiCls(divResult.metrics.hhi)}`}>
                      {divResult.metrics.hhi.toLocaleString()}
                    </div>
                    <div className="metric-sub">{hhiVerdict(divResult.metrics.hhi)}</div>
                  </div>
                  <div className="metric-card">
                    <div className="metric-label">
                      <Tip text="How many truly different industries your money is actually working in. More = better protection. If one industry has a bad year, it won't tank your whole portfolio.">Real Sectors</Tip>
                    </div>
                    <div className="metric-num cyan">{divResult.metrics.effective_industries}</div>
                    <div className="metric-sub">Meaningfully distinct bets</div>
                  </div>
                  <div className="metric-card">
                    <div className="metric-label">
                      <Tip text="The largest single industry slice of your portfolio. If this is over 40%, a bad year in that one sector could seriously hurt your returns.">Biggest Bet</Tip>
                    </div>
                    <div className={`metric-num ${topCls(divResult.metrics.top_industry_weight_pct)}`}>
                      {divResult.metrics.top_industry_weight_pct}%
                    </div>
                    <div className="metric-sub">{topVerdict(divResult.metrics.top_industry_weight_pct)}</div>
                  </div>
                  <div className="metric-card">
                    <div className="metric-label">
                      <Tip text="A grade on how evenly your money is spread. 'Great' = no single area dominates. 'Poor' = your money is clumped in just a few places, which amplifies risk.">Balance</Tip>
                    </div>
                    <div className={`metric-num ${balance.cls}`}>{balance.word}</div>
                    <div className="metric-sub">How evenly spread your holdings are</div>
                  </div>
                </div>
              )
            })()}

            {divResult?.industry_breakdown?.length > 0 && (
              <div className="sectors">
                <div className="sec-header">
                  <span className="sec-title">Where Your Money Is</span>
                  <button
                    className={`unknown-toggle ${hideUnknown ? 'active' : ''}`}
                    onClick={() => {
                      const next = !hideUnknown
                      setHideUnknown(next)
                      if (holdings.length > 0) runDiversity(holdings, next)
                    }}
                  >
                    {hideUnknown ? 'Show Unknown' : 'Hide Unknown'}
                  </button>
                  <span className="sec-badge">{divResult.industry_breakdown.length} sectors</span>
                </div>
                {divResult.industry_breakdown.map((item, i) => {
                  const stocks = divResult.industry_stocks?.[item.industry] ?? []
                  const isOpen = expandedSector === item.industry
                  return (
                    <div key={i} className="sector-row">
                      <div
                        className="sector-top"
                        style={{ cursor: stocks.length > 0 ? 'pointer' : 'default' }}
                        onClick={() => stocks.length > 0 && setExpandedSector(isOpen ? null : item.industry)}
                      >
                        <span className="sector-rank">{String(i + 1).padStart(2, '0')}</span>
                        <span className="sector-name">{item.industry}</span>
                        <span className="sector-val">${(item.value / 1000).toFixed(1)}k</span>
                        <span className="sector-pct">{item.weight_pct}%</span>
                        {stocks.length > 0 && (
                          <span className="sector-chevron">{isOpen ? '▴' : '▾'}</span>
                        )}
                      </div>
                      <div className="bar-track">
                        <div className="bar-fill"
                             style={{ '--bar-w': `${item.weight_pct}%`, background: sectorColor(item.weight_pct) }} />
                      </div>
                      {isOpen && stocks.length > 0 && (
                        <div className="sector-stocks">
                          {stocks.map(sym => (
                            <span key={sym} className="sector-stock-chip">{sym}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
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
                  Waiting for your positions<br />
                  Open Fidelity/SoFi → Positions tab
                  <span className="cursor" />
                </div>
              </div>
            )}
          </>
        )}

        {/* ══ REBALANCE TAB ══════════════════════════════════════════════ */}
        {tab === 'optimize' && (
          <>
            <div className="period-row">
              <span className="period-label">Lookback</span>
              {['1y','2y','3y','5y','10y'].map(p => (
                <button
                  key={p}
                  className={`period-btn ${optPeriod === p ? 'active' : ''}`}
                  onClick={() => { setOptPeriod(p); setOptResult(null) }}
                >
                  {p}
                </button>
              ))}
            </div>
            {(optPeriod === '1y' || optPeriod === '2y') && (
              <div className="period-warn">
                ⚠ Short windows can be skewed by a single bull or bear market — treat these numbers as rough estimates.
              </div>
            )}

            <button className="opt-btn" onClick={handleOptimize} disabled={optLoading}>
              {optLoading
                ? <>CALCULATING<span className="dot">.</span><span className="dot">.</span><span className="dot">.</span></>
                : '◎  SHOW ME HOW TO REBALANCE'}
            </button>

            {optLoading && (
              <div className="loading-row">
                <div className="spinner cyan" />
                <span className="loading-label cyan">Crunching {optPeriod} of data…</span>
              </div>
            )}

            {optError && <div className="error-bar">{optError}</div>}

            {optResult && <WeightChart optResult={optResult} period={optPeriod} />}

            {!optResult && !optLoading && !optError && (
              <div className="empty">
                <div className="empty-bars">
                  {[14, 32, 20, 28, 10, 24, 18].map((h, i) => (
                    <div key={i} className="empty-bar"
                         style={{ height: `${h}px`, animationDelay: `${i * 0.12}s` }} />
                  ))}
                </div>
                <div className="empty-label">
                  {holdings.length > 0
                    ? <>Click the button above to see<br />your personalized rebalancing plan<span className="cursor" /></>
                    : <>Scan your positions first<br />on the Overview tab<span className="cursor" /></>
                  }
                </div>
              </div>
            )}
          </>
        )}

        {/* ══ TEST STOCK TAB ═════════════════════════════════════════════ */}        
        {tab === 'test-stock' && (
          <>
            <div className="test-note">
              Simulate adding one position and preview how your scores change.
              Works with positions scraped from Fidelity and SoFi.
            </div>
            <div className="method-pill">
              <Tip text="Method: 1-year history window. Concentration from HHI, Diversification Score from entropy, Volatility from average annualized vol, and Sharpe from optimizer. Combined into a 0-100 Portfolio Health Index for before/after comparison only.">
                Method
              </Tip>
            </div>

            <div className="test-controls">
              <div className="test-field" style={{ position: 'relative' }}>
                <label className="test-label">Stock symbol</label>
                <input
                  className="test-input"
                  type="text"
                  value={stockQuery}
                  onChange={(e) => { setStockQuery(e.target.value); setSelectedSymbol(''); setShowDropdown(true) }}
                  onFocus={() => setShowDropdown(true)}
                  onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                  placeholder={stockLoading ? 'Loading stocks…' : 'Search symbol, name, or sector…'}
                  disabled={stockLoading}
                />
                {showDropdown && filteredStocks.length > 0 && (
                  <div className="stock-dropdown">
                    {filteredStocks.map((stock) => (
                      <div
                        key={stock.symbol}
                        className={`stock-option${selectedSymbol === stock.symbol ? ' selected' : ''}`}
                        onMouseDown={() => {
                          setSelectedSymbol(stock.symbol)
                          setStockQuery(`${stock.symbol} — ${stock.name}`)
                          setShowDropdown(false)
                        }}
                      >
                        <span className="stock-sym">{stock.symbol}</span>
                        <span className="stock-name">{stock.name}</span>
                        <span className="stock-sector">{stock.sector}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="test-field">
                <label className="test-label" htmlFor="test-value">Add amount (USD)</label>
                <input
                  id="test-value"
                  className="test-input"
                  type="number"
                  min="1"
                  step="1"
                  value={testValue}
                  onChange={(e) => setTestValue(e.target.value)}
                  placeholder="500"
                />
              </div>
            </div>

            <button className="opt-btn" onClick={handleTestStock} disabled={testLoading || stockLoading}>
              {testLoading
                ? <>SIMULATING<span className="dot">.</span><span className="dot">.</span><span className="dot">.</span></>
                : '◌  RUN TEST STOCK IMPACT'}
            </button>

            {stockError && <div className="error-bar">{stockError}</div>}
            {testError && <div className="error-bar">{testError}</div>}

            {testResult && (
              <>
                <div className="test-headline">
                  If you add ${Number(testValue || 0).toLocaleString()} of {selectedSymbol}...
                </div>

                <div className="health-section">
                  <div className="health-header">
                    <span className="health-title">
                      <Tip text="Portfolio Health Index is a comparison score from 0 to 100. Higher means healthier balance across concentration, diversification, volatility, and risk-adjusted return.">
                        Portfolio Health Index
                      </Tip>
                    </span>
                    <span className={`health-delta ${healthDelta > 0 ? 'green' : healthDelta < 0 ? 'red' : 'amber'}`}>
                      {healthDelta > 0 ? '+' : ''}{healthDelta}
                    </span>
                  </div>
                  <div className="health-row">
                    <HealthGauge label="Current" score={baseHealth} />
                    <HealthGauge label="After Add" score={simHealth} />
                  </div>
                </div>

                <div className="impact-grid">
                  <div className="impact-card">
                    <div className="impact-label">
                      <Tip text="How spread out your portfolio is across different areas. Better diversification means one area has less power over your total results.">Diversification Impact</Tip>
                    </div>
                    <div className={`impact-value ${divStatus.cls}`}>{divStatus.word}</div>
                    <div className="impact-sub">
                      Top sector {baseDiv?.top_industry_weight_pct?.toFixed(2)}% → {simDiv?.top_industry_weight_pct?.toFixed(2)}%
                      {' '}({topDelta >= 0 ? 'Worse' : 'Better'})
                    </div>
                    <div className="impact-sub">
                      Driver: top sector concentration {topDelta >= 0 ? '↑' : '↓'} {Math.abs(topDelta).toFixed(2)}%
                    </div>
                  </div>

                  <div className="impact-card">
                    <div className="impact-label">
                      <Tip text="How much your portfolio tends to swing. Higher volatility means larger up-and-down moves over time.">Volatility Impact</Tip>
                    </div>
                    <div className={`impact-value ${volStatus.cls}`}>{volStatus.word}</div>
                    <div className="impact-sub">
                      Portfolio volatility: {baseAvgVol == null ? '-' : `${(baseAvgVol * 100).toFixed(2)}%`}
                      {' '}→ {simAvgVol == null ? '-' : `${(simAvgVol * 100).toFixed(2)}%`}
                    </div>
                  </div>

                  <div className="impact-card">
                    <div className="impact-label">
                      <Tip text="Return per unit of risk in past data. Higher Sharpe means the portfolio earned more reward for each unit of volatility.">Sharpe Impact</Tip>
                    </div>
                    <div className={`impact-value ${sharpeStatus.cls}`}>{sharpeStatus.word}</div>
                    <div className="impact-sub">
                      Sharpe: {optUnavailable ? '-' : baseSharpe.toFixed(3)} → {optUnavailable ? '-' : simSharpe.toFixed(3)}
                    </div>
                  </div>

                  <div className="impact-card">
                    <div className="impact-label">
                      <Tip text="How much your portfolio relies on one area. High concentration means one theme can dominate your results.">Concentration</Tip>
                    </div>
                    <div className={`impact-value ${topDelta > 0 ? 'red' : topDelta < 0 ? 'green' : 'amber'}`}>
                      {topDelta > 0 ? 'Higher' : topDelta < 0 ? 'Lower' : 'Neutral'}
                    </div>
                    <div className="impact-sub">Top sector: {baseDiv?.top_industry_weight_pct?.toFixed(2)}% → {simDiv?.top_industry_weight_pct?.toFixed(2)}%</div>
                    <div className="impact-sub">Top holding: {baseTopHoldingPct.toFixed(2)}% → {simTopHoldingPct.toFixed(2)}%</div>
                  </div>
                </div>

                <div className="test-grid">
                  <div className="test-box">
                    <div className="test-box-title">
                      <Tip text="A suggested mix based on past data. It is not a prediction.">Suggested rebalance (optional)</Tip>
                    </div>
                    {optUnavailable ? (
                      <div className="test-box-sub">Optimization unchanged / insufficient data.</div>
                    ) : (
                      <>
                        <div className="test-line">Optimized Sharpe: {simSharpe.toFixed(2)}</div>
                        {optChanged ? (
                          <div className="test-line">
                            Top suggestions: {simTop3.map(([t, w]) => `${t} ${(Number(w) * 100).toFixed(1)}%`).join(' | ')}
                          </div>
                        ) : (
                          <div className="test-box-sub">Optimization unchanged / insufficient data.</div>
                        )}
                        <div className="test-box-sub">This is based on last 1 year performance.</div>
                      </>
                    )}
                  </div>

                  <div className="test-box">
                    <div className="test-box-title">
                      <Tip text="Overall portfolio-health summary from the simulation, focused on diversification, volatility, and concentration.">Portfolio Health Summary</Tip>
                    </div>
                    <div className="test-line">Status: {simDiv?.rating}</div>
                    <div className="test-line">Diversification: {divStatus.word}</div>
                    <div className="test-line">Volatility: {volStatus.word}</div>
                    <div className="test-line">Sharpe: {sharpeStatus.word}</div>
                  </div>
                </div>

                <details className="test-details">
                  <summary>Details</summary>
                  <div className="test-details-body">
                    <div className="test-line">Concentration (HHI): {baseDiv?.hhi} → {simDiv?.hhi} ({signed(hhiDelta, 0)})</div>
                    <div className="test-line">Diversification Score (Entropy): {baseDiv?.entropy} → {simDiv?.entropy} ({signed(entropyDelta, 4)})</div>
                    <div className="test-line">Effective industries: {baseDiv?.effective_industries} → {simDiv?.effective_industries} ({signed(effectiveDelta, 2)})</div>
                    {baseDiv?.rating !== simDiv?.rating && (
                      <div className="test-line">Rating shift: {baseDiv?.rating} → {simDiv?.rating}</div>
                    )}
                  </div>
                </details>

                <div className="test-box-sub">
                  This simulation is for portfolio-health comparison, not investment advice.
                </div>
              </>
            )}

            {!testResult && !testLoading && (
              <div className="empty">
                <div className="empty-bars">
                  {[12, 26, 17, 29, 20].map((h, i) => (
                    <div key={i} className="empty-bar" style={{ height: `${h}px`, animationDelay: `${i * 0.1}s` }} />
                  ))}
                </div>
                <div className="empty-label">
                  Pick a stock and test amount<br />
                  to preview diversity and risk impact
                  <span className="cursor" />
                </div>
              </div>
            )}
          </>
        )}

        {/* Footer */}
        <div className="footer">
          <span>Safeplay v0.1</span>
          <span>◉ localhost:8787</span>
        </div>

      </div>
    </div>
  )
}

export default App
