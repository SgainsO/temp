const API_BASE = 'http://localhost:8787'

// ── Drag helper ───────────────────────────────────────────────────────────────

function makeDraggable(panel, handle) {
  handle.style.cursor = 'grab'
  handle.addEventListener('mousedown', e => {
    e.preventDefault()
    const rect = panel.getBoundingClientRect()
    // Switch from bottom/right anchoring to top/left so we can move freely
    panel.style.bottom = ''
    panel.style.right  = ''
    panel.style.left   = rect.left + 'px'
    panel.style.top    = rect.top  + 'px'
    const offsetX = e.clientX - rect.left
    const offsetY = e.clientY - rect.top
    handle.style.cursor = 'grabbing'
    const onMove = e => {
      panel.style.left = (e.clientX - offsetX) + 'px'
      panel.style.top  = (e.clientY - offsetY) + 'px'
    }
    const onUp = () => {
      handle.style.cursor = 'grab'
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup',   onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup',   onUp)
  })
}

// ── Tooltip helper ────────────────────────────────────────────────────────────

let _tipEl = null
function getTip() {
  if (!_tipEl) {
    _tipEl = document.createElement('div')
    _tipEl.style.cssText = [
      'position:fixed',
      'z-index:9999999',
      'background:#0c1524',
      'border:1px solid #2a4a70',
      'border-radius:6px',
      'padding:9px 11px',
      'font-size:10px',
      'color:#c9d8ed',
      'line-height:1.55',
      'max-width:280px',
      'box-shadow:0 6px 24px rgba(0,0,0,0.6)',
      'pointer-events:none',
      'display:none',
      'white-space:normal',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif',
      'font-weight:400',
      'letter-spacing:0',
    ].join(';')
    document.body.appendChild(_tipEl)
  }
  return _tipEl
}

function addTip(el, text) {
  el.style.cursor = 'help'
  el.addEventListener('mouseenter', () => {
    const tip = getTip()
    tip.textContent = text
    tip.style.display = 'block'
    const r   = el.getBoundingClientRect()
    const tipW = 224
    const tipH = tip.offsetHeight
    const top  = r.top - tipH - 8
    tip.style.left = Math.max(4, Math.min(r.left + r.width / 2 - tipW / 2, window.innerWidth - tipW - 4)) + 'px'
    tip.style.top  = (top < 4 ? r.bottom + 8 : top) + 'px'
  })
  el.addEventListener('mouseleave', () => getTip().style.display = 'none')
}

// ── Floating delta panel ─────────────────────────────────────────────────────

function showAllocationPanel(allocations) {
  const existing = document.getElementById('hka-panel')
  if (existing) existing.remove()

  const entries = Object.entries(allocations)
  if (entries.length === 0) return

  const panel = document.createElement('div')
  panel.id = 'hka-panel'
  panel.style.cssText = [
    'position:fixed',
    'bottom:24px',
    'right:24px',
    'z-index:999999',
    'background:#0d1a2a',
    'border:1px solid #1e3a5a',
    'border-radius:8px',
    'padding:12px 14px',
    'font-family:ui-monospace,monospace',
    'font-size:12px',
    'color:#c9d8ed',
    'box-shadow:0 4px 24px rgba(0,0,0,0.5)',
    'min-width:220px',
    'min-height:80px',
    'overflow:auto',
    'resize:both',
  ].join(';')

  const title = document.createElement('div')
  title.style.cssText = 'font-size:10px;letter-spacing:0.12em;color:#5aadde;text-transform:uppercase;margin-bottom:8px;padding-right:16px;'
  title.textContent = '⬡ Hackalytics — Recommended Allocation'
  panel.appendChild(title)

  const hdr = document.createElement('div')
  hdr.style.cssText = 'display:grid;grid-template-columns:60px 1fr 1fr;gap:8px;font-size:9px;color:#5a7a9a;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:4px;padding-bottom:4px;border-bottom:1px solid #1e3050;'
  const hdrTicker = document.createElement('span')
  hdrTicker.textContent = 'Ticker'
  const hdrCurrent = document.createElement('span')
  hdrCurrent.style.textAlign = 'right'
  hdrCurrent.textContent = 'Current'
  addTip(hdrCurrent, 'What percentage of your total portfolio is currently in this stock.')
  const hdrTarget = document.createElement('span')
  hdrTarget.style.textAlign = 'right'
  hdrTarget.textContent = 'Target'
  addTip(hdrTarget, 'The suggested percentage — calculated to balance risk and reward across your whole portfolio. Moving toward this number could improve your overall returns.')
  hdr.appendChild(hdrTicker)
  hdr.appendChild(hdrCurrent)
  hdr.appendChild(hdrTarget)
  panel.appendChild(hdr)

  entries
    .sort((a, b) => b[1].optPct - a[1].optPct)
    .forEach(([sym, { curPct, optPct }]) => {
      const row = document.createElement('div')
      row.style.cssText = 'display:grid;grid-template-columns:60px 1fr 1fr;gap:8px;padding:3px 0;border-bottom:1px solid rgba(255,255,255,0.04);'

      const symEl = document.createElement('span')
      symEl.style.cssText = 'font-weight:700;color:#8aaccc;'
      symEl.textContent = sym

      const curEl = document.createElement('span')
      curEl.style.cssText = 'text-align:right;color:#7a9abb;'
      curEl.textContent = `${curPct.toFixed(1)}%`

      const optEl = document.createElement('span')
      optEl.style.cssText = 'text-align:right;font-weight:700;color:#00d4ff;'
      optEl.textContent = `${optPct.toFixed(1)}%`

      row.appendChild(symEl)
      row.appendChild(curEl)
      row.appendChild(optEl)
      panel.appendChild(row)
    })

  const close = document.createElement('button')
  close.textContent = '✕'
  close.style.cssText = 'position:absolute;top:8px;right:10px;background:none;border:none;color:#8aaccc;cursor:pointer;font-size:12px;padding:0;'
  close.onclick = () => panel.remove()
  panel.appendChild(close)

  document.body.appendChild(panel)
  makeDraggable(panel, title)
}

// ── Optimizer call ───────────────────────────────────────────────────────────

async function runOptimizer(holdingsData) {
  try {
    const resp = await fetch(`${API_BASE}/api/optimize-from-holdings`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ data: holdingsData }),
    })
    if (!resp.ok) {
      console.warn('[Hackalytics] Optimizer returned', resp.status)
      return
    }
    const result = await resp.json()
    const weights    = result.weights
    const curWeights = result.current_weights
    if (!weights || !curWeights) return

    const allocations = {}
    for (const sym of result.tickers) {
      allocations[sym.toUpperCase()] = {
        curPct: (curWeights[sym] ?? 0) * 100,
        optPct: (weights[sym]    ?? 0) * 100,
      }
    }

    console.log('[Hackalytics] allocations:', allocations)
    showAllocationPanel(allocations)
  } catch (err) {
    console.error('[Hackalytics] Optimizer call failed:', err)
  }
}

// ── Message listener ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SCRAPE_TRADES') {
    scrapeWithRetry().then((data) => {
      console.log('[Hackalytics] Scraped:', data.length, 'positions')
      if (data.length === 0) {
        sendResponse({ data })
        return
      }

      // Save holdings
      fetch(`${API_BASE}/api/save-holdings`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ data }),
      }).catch(err => console.error('[Hackalytics] Save failed:', err))

      // Show optimizer deltas in floating panel on the broker page
      runOptimizer(data)

      // Show volatility analysis in separate floating panel
      runVolatility(data)

      sendResponse({ data })
    }).catch((err) => {
      console.error('[Hackalytics] Scrape error:', err)
      sendResponse({ data: [], error: String(err) })
    })
  }
  return true
})

// ── Volatility panel ─────────────────────────────────────────────────────────

// Annualized vol → plain-English risk tier + color
function volRisk(annualVol) {
  if (annualVol == null) return { label: 'Unknown', color: '#3a5578' }
  const p = annualVol * 100
  if (p > 60) return { label: 'Very High Risk', color: '#ff4757' }
  if (p > 40) return { label: 'High Risk',      color: '#f5a623' }
  if (p > 25) return { label: 'Moderate Risk',  color: '#f8c471' }
  if (p > 15) return { label: 'Low-Mod Risk',   color: '#00d4ff' }
  return               { label: 'Low Risk',      color: '#00ff88' }
}

// Annualized vol → typical monthly swing (÷ √12)
function toMonthly(annualVol) {
  if (annualVol == null) return null
  return Math.round(annualVol / Math.sqrt(12) * 100)
}

function showVolatilityPanel(volData) {
  const existing = document.getElementById('hka-vol-panel')
  if (existing) existing.remove()

  const analysis  = volData.volatility_analysis || {}
  const perTicker = analysis.annualized_volatility || {}
  const spikes    = analysis.spike_tickers || []

  const entries = Object.entries(perTicker)
  if (entries.length === 0) return

  entries.sort((a, b) => (b[1].vol20 || 0) - (a[1].vol20 || 0))

  const panel = document.createElement('div')
  panel.id = 'hka-vol-panel'
  panel.style.cssText = [
    'position:fixed',
    'bottom:24px',
    'left:24px',
    'z-index:999999',
    'background:#0d1a2a',
    'border:1px solid #1e3a5a',
    'border-radius:8px',
    'padding:12px 14px',
    'font-family:ui-monospace,monospace',
    'font-size:12px',
    'color:#c9d8ed',
    'box-shadow:0 4px 24px rgba(0,0,0,0.5)',
    'min-width:280px',
    'min-height:80px',
    'overflow:auto',
    'resize:both',
  ].join(';')

  // Title
  const title = document.createElement('div')
  title.style.cssText = 'font-size:10px;letter-spacing:0.12em;color:#5aadde;text-transform:uppercase;margin-bottom:8px;padding-right:16px;'
  title.textContent = '⬡ Hackalytics — Risk Report'
  panel.appendChild(title)

  // Plain-English alert
  const alertEl = document.createElement('div')
  if (spikes.length > 0) {
    alertEl.style.cssText = 'font-size:10px;color:#ff4757;background:rgba(255,71,87,0.08);border:1px solid rgba(255,71,87,0.25);border-radius:4px;padding:6px 8px;margin-bottom:8px;line-height:1.6;'
    alertEl.textContent = `⚠  ${spikes.length} of your stocks are moving much more than their recent average. ${spikes.join(', ')}.`
  } else {
    alertEl.style.cssText = 'font-size:10px;color:#00ff88;background:rgba(0,255,136,0.06);border:1px solid rgba(0,255,136,0.2);border-radius:4px;padding:6px 8px;margin-bottom:8px;'
    alertEl.textContent = '✓  All stocks are moving at their expected pace — no unusual activity.'
  }
  panel.appendChild(alertEl)

  // Column header
  const hdr = document.createElement('div')
  hdr.style.cssText = 'display:grid;grid-template-columns:48px 1fr auto;gap:8px;font-size:9px;color:#5a7a9a;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:4px;padding-bottom:4px;border-bottom:1px solid #1e3050;'
  const hdrSym = document.createElement('span')
  hdrSym.textContent = 'Ticker'
  const hdrRisk = document.createElement('span')
  hdrRisk.textContent = 'Risk Level'
  addTip(hdrRisk, 'How much this stock\'s price has been jumping around lately. "Very High Risk" means it\'s moving far more than normal — like a rollercoaster vs. a gentle ride.')
  const hdrSwing = document.createElement('span')
  hdrSwing.textContent = 'Typical Monthly Swing'
  addTip(hdrSwing, 'On average, how much this stock\'s price might move up or down in a single month. A 15% swing on $1,000 means it could shift by about $150.')
  hdr.appendChild(hdrSym)
  hdr.appendChild(hdrRisk)
  hdr.appendChild(hdrSwing)
  panel.appendChild(hdr)

  // Per-ticker rows (accordion)
  entries.forEach(([ticker, m]) => {
    const isSpike     = m.volatility_spike
    const risk        = volRisk(m.vol20)
    const monthly     = toMonthly(m.vol20)
    const swingTxt    = monthly != null ? `~${monthly}% / month` : '—'
    const spikeDir    = m.spike_direction === 'down' ? 'down' : 'up'
    const spikeTxt    = isSpike ? `  ⚡ recently spiked ${spikeDir}` : ''
    const spikeMonths = m.spike_months || []

    // Accordion wrapper
    const wrapper = document.createElement('div')
    wrapper.style.cssText = 'cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.04);margin-bottom:1px;'

    // Header row
    const row = document.createElement('div')
    row.style.cssText = `display:grid;grid-template-columns:48px 1fr auto 12px;gap:8px;padding:4px 0 2px;${isSpike ? 'background:rgba(255,71,87,0.04);border-radius:3px;padding:4px 4px 2px;' : ''}`

    const symEl = document.createElement('span')
    symEl.style.cssText = 'font-weight:700;color:#8aaccc;'
    symEl.textContent = ticker

    const riskTips = {
      'Very High Risk': 'This stock has been moving far more than usual — it could jump up or crash down quickly. Only hold this if big swings don\'t bother you.',
      'High Risk':      'This stock moves a lot. There\'s good upside potential, but it can also fall fast. Think about how much of your money is here.',
      'Moderate Risk':  'About average volatility — some ups and downs, but nothing unusual for most growth stocks.',
      'Low-Mod Risk':   'Calmer than most stocks. More stable, though still not immune to market shifts.',
      'Low Risk':       'This stock has been steady and predictable. Fewer surprises — but potentially slower growth too.',
    }
    const riskEl = document.createElement('span')
    riskEl.style.cssText = `font-weight:${isSpike ? '700' : '400'};color:${risk.color};`
    riskEl.textContent = risk.label + spikeTxt
    addTip(riskEl, (riskTips[risk.label] || 'Risk level based on recent price movement.') + (isSpike ? ` It has also recently spiked ${spikeDir} — moving much more than its own recent history.` : ''))

    const swingEl = document.createElement('span')
    swingEl.style.cssText = `color:${risk.color};font-weight:700;white-space:nowrap;`
    swingEl.textContent = swingTxt
    addTip(swingEl, `On average, this stock\'s price moves up or down by about ${swingTxt.replace('~', '')} — that\'s how much it might shift in any given month based on recent history.`)

    const chevron = document.createElement('span')
    chevron.style.cssText = 'color:#60a0c8;font-size:9px;align-self:center;display:inline-block;transition:transform 0.15s;'
    chevron.textContent = '▾'

    row.appendChild(symEl)
    row.appendChild(riskEl)
    row.appendChild(swingEl)
    row.appendChild(chevron)
    wrapper.appendChild(row)

    // Accordion detail (hidden by default)
    const detail = document.createElement('div')
    detail.style.cssText = 'display:none;font-size:9px;padding:4px 4px 8px 56px;line-height:1.9;'

    if (spikeMonths.length > 0) {
      const label = document.createElement('div')
      label.style.cssText = 'color:#5aadde;margin-bottom:3px;letter-spacing:0.05em;'
      label.textContent = 'Typical spike months (5yr avg):'
      addTip(label, 'Based on 5 years of history, these are the months where this stock has tended to move the most — up or down. Months where most stocks moved together (like a market crash) are excluded, so these are patterns specific to this stock.')
      detail.appendChild(label)

      spikeMonths.forEach(sm => {
        const item = document.createElement('div')
        const arrow = sm.direction === 'up' ? '▲' : '▼'
        const color = sm.direction === 'up' ? '#00cc66' : '#ff4757'
        item.innerHTML = `<span style="color:${color};font-weight:700;">${arrow} ${sm.month}</span>&nbsp;&nbsp;<span style="color:#8aaccc;">${sm.avg_pct > 0 ? '+' : ''}${sm.avg_pct}%</span>`
        detail.appendChild(item)
      })
    } else {
      detail.style.color = '#628aaa'
      detail.textContent = 'No consistent monthly spike pattern detected.'
    }

    wrapper.appendChild(detail)

    // Toggle accordion on click
    wrapper.addEventListener('click', () => {
      const open = detail.style.display !== 'none'
      detail.style.display = open ? 'none' : 'block'
      chevron.style.transform = open ? '' : 'rotate(180deg)'
    })

    panel.appendChild(wrapper)
  })

  // Footer
  const footer = document.createElement('div')
  footer.style.cssText = 'margin-top:8px;padding-top:6px;border-top:1px solid #1e3050;font-size:9px;color:#628aaa;line-height:1.5;'
  footer.textContent = '"Monthly swing" = how much this stock might typically move up or down in a single month.'
  panel.appendChild(footer)

  // Close button
  const close = document.createElement('button')
  close.textContent = '✕'
  close.style.cssText = 'position:absolute;top:8px;right:10px;background:none;border:none;color:#8aaccc;cursor:pointer;font-size:12px;padding:0;'
  close.onclick = () => panel.remove()
  panel.appendChild(close)

  document.body.appendChild(panel)
  makeDraggable(panel, title)
}

// ── Volatility call ───────────────────────────────────────────────────────────

const VOL_SKIP = new Set(['pending activity', 'account total', 'grand total', 'cash', 'account:', '—', '-', ''])

async function runVolatility(holdingsData) {
  const tickers = [...new Set(
    holdingsData
      .map(h => (h.symbol || '').trim().toUpperCase())
      .filter(sym => sym && !VOL_SKIP.has(sym.toLowerCase()))
  )]
  if (tickers.length === 0) return

  try {
    const resp = await fetch(`${API_BASE}/api/volatality_anal`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ tickers, period: '1y' }),
    })
    if (!resp.ok) {
      console.warn('[Hackalytics] Volatility returned', resp.status)
      return
    }
    const result = await resp.json()
    console.log('[Hackalytics] volatility:', result)
    showVolatilityPanel(result)
  } catch (err) {
    console.error('[Hackalytics] Volatility call failed:', err)
  }
}



// ── Scraping helpers ─────────────────────────────────────────────────────────

const FIELD_MAP = {
  sym:       'symbol',
  curVal:    'currentValue',
  actPer:    'pctOfAccount',
  qty:       'quantity',
  cstBasTot: 'costBasis',
}

const SKIP_SYMBOLS = ['pending activity', 'account total', 'grand total', 'account:']
const BROKER_HINTS = {
  fidelity: ['fidelity.com'],
  sofi: ['sofi.com'],
}

/**
 * Inspect the current page's hostname and return which broker we're on.
 *
 * Known values:
 *   'fidelity'  – hostname contains one of the fidelity hints
 *   'sofi'      – hostname contains one of the sofi hints
 *   'unknown'   – no match, or a broker we don't support yet
 *
 * You can run this from the console yourself to verify:
 *   chrome.devtools.inspectedWindow.eval('detectBroker()', console.log)
 */
function detectBroker() {
  const host = (location.hostname || '').toLowerCase()
  if (BROKER_HINTS.fidelity.some((d) => host.includes(d))) return 'fidelity'
  if (BROKER_HINTS.sofi.some((d) => host.includes(d))) return 'sofi'
  return 'unknown'
}

// expose helpers for manual debugging via console
window._hackalytics = {
  detectBroker,
  scrapeTradeData,
  scrapeFidelityTradeData,
  scrapeSofiTradeData,
  scrapeFlexTableTradeData,
}

function getAllDocuments() {
  const docs = [{ doc: document, label: 'main' }]
  document.querySelectorAll('iframe').forEach((iframe, i) => {
    try {
      if (iframe.contentDocument) {
        docs.push({ doc: iframe.contentDocument, label: `iframe[${i}]` })
      }
    } catch (e) {}
  })
  return docs
}

function scrapeTradeData() {
  const broker = detectBroker()
  console.log('[Diag] detected broker:', broker)

  if (broker === 'sofi') {
    const sofiData = scrapeSofiTradeData()
    if (sofiData.length > 0) return sofiData
    console.log('[Diag] SoFi parser returned 0 rows, trying Fidelity parser fallback')
  }

  if (broker === 'fidelity') {
    const fidData = scrapeFidelityTradeData()
    if (fidData.length > 0) return fidData
    console.log('[Diag] Fidelity parser returned 0 rows, trying SoFi parser fallback')
    const sofiData = scrapeSofiTradeData()
    if (sofiData.length > 0) return sofiData
  }

  // if broker unknown or both parsers failed just try both generally
  return scrapeFidelityTradeData()
}

function scrapeFidelityTradeData() {
  const allDocs = getAllDocuments()
  const rowMap  = {}

  allDocs.forEach(({ doc }) => {
    doc.querySelectorAll('.ag-row').forEach((row) => {
      const idx = row.getAttribute('row-index')
      if (idx === null) return
      if (!rowMap[idx]) rowMap[idx] = {}

      row.querySelectorAll('[col-id]').forEach((cell) => {
        const colId = cell.getAttribute('col-id')
        if (!colId) return
        const value = (cell.innerText || '').split('\n').map(s => s.trim()).filter(Boolean)[0] || ''
        if (!value) return
        rowMap[idx][colId] = value
        const friendly = FIELD_MAP[colId]
        if (friendly && !rowMap[idx][friendly]) rowMap[idx][friendly] = value
      })
    })
  })

  const allRows = Object.values(rowMap)
  console.log('[Diag] total rows in rowMap:', allRows.length)
  if (allRows.length > 0) {
    console.log('[Diag] sample row[0] keys:', Object.keys(allRows[0]))
    console.log('[Diag] sample row[0] data:', allRows[0])
  }

  let filtered = allRows.filter((row) => {
    const sym = (row.symbol || '').toLowerCase()
    return !SKIP_SYMBOLS.includes(sym) && Object.keys(row).length > 0
  })
  console.log('[Diag] after filter:', filtered.length, 'rows remain')

  // if the ag-grid approach produced no results, try the newer flex-table format
  if (filtered.length === 0) {
    const flexRows = scrapeFlexTableTradeData(allDocs)
    if (flexRows.length > 0) {
      console.log('[Diag] flex table parser returned rows:', flexRows.length)
      filtered = flexRows
    }
  }

  return filtered
}

function normalizeHeader(text) {
  return (text || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9% ]+/g, '')
    .replace(/\s+/g, ' ')
}

function mapHeaderToField(header) {
  const h = normalizeHeader(header)
  if (h.includes('symbol') || h.includes('ticker')) return 'symbol'
  if (h.includes('market value') || h === 'value' || h.includes('current value')) return 'currentValue'
  if (h.includes('% of') || h.includes('allocation') || h.includes('weight')) return 'pctOfAccount'
  if (h.includes('quantity') || h.includes('shares') || h === 'qty') return 'quantity'
  if (h.includes('cost basis') || h === 'cost') return 'costBasis'
  return null
}

function parseCellValue(cell) {
  const raw = cell?.innerText || ''
  return raw.split('\n').map((s) => s.trim()).filter(Boolean)[0] || ''
}

function scrapeSofiTradeData() {
  const allDocs = getAllDocuments()
  const rowsOut = []

  allDocs.forEach(({ doc, label }) => {
    const tables = Array.from(doc.querySelectorAll('table'))
    console.log(`[Diag][SoFi] "${label}" -> table count:`, tables.length)

        tables.forEach((table, tableIdx) => {
        const headers = Array.from(table.querySelectorAll('thead th, tr th'))
          .map((th) => parseCellValue(th))
        if (headers.length === 0) return

        const fieldByCol = headers.map(mapHeaderToField)
        if (!fieldByCol.some(Boolean)) return

        const bodyRows = Array.from(table.querySelectorAll('tbody tr'))
        if (bodyRows.length === 0) return

        bodyRows.forEach((tr) => {
          const cells = Array.from(tr.querySelectorAll('td'))
          if (cells.length === 0) return
          const row = {}

          cells.forEach((td, i) => {
            const field = fieldByCol[i]
            if (!field) return
            const value = parseCellValue(td)
            if (value) row[field] = value
          })

          if (!row.symbol) return
          const sym = row.symbol.toLowerCase()
          if (SKIP_SYMBOLS.includes(sym)) return
          rowsOut.push(row)
        })

        console.log(`[Diag][SoFi] table ${tableIdx} parsed rows:`, rowsOut.length)
      })
  })

  console.log('[Diag][SoFi] total parsed rows:', rowsOut.length)

  // if no rows were found using the <table> approach, look for generic
  // 'data-mjs-value' elements – the new SoFi layout wraps each holding in a
  // div carrying the symbol and values in that attribute.
  if (rowsOut.length === 0) {
    const generic = []
    allDocs.forEach(({ doc, label }) => {
      // restrict to the row elements we saw in the DOM snippet
      const elems = Array.from(doc.querySelectorAll('[data-mjs="summary-watchlist-item"][data-mjs-value]'))
      if (elems.length) console.log(`[Diag][SoFi] "${label}" generic elems:`, elems.length)

      elems.forEach((el) => {
        const attr = el.getAttribute('data-mjs-value') || ''
        if (!attr.startsWith('symbol=')) return
        const row = {}

        // symbol is mandatory and appears in the attribute
        const symMatch = attr.match(/symbol=([^;]+)/)
        if (symMatch) row.symbol = symMatch[1]

        // try to pick up quantity/values from aria-labels if present
        const qtyEl = el.querySelector('[aria-label^="number of shares"]')
        if (qtyEl) row.quantity = parseCellValue(qtyEl)
        const valEl = el.querySelector('[aria-label^="Total Value"]')
        if (valEl) row.currentValue = parseCellValue(valEl)

        // fallback: look for any $ value in text nodes
        if (!row.currentValue) {
          const txt = el.innerText || ''
          const m = txt.match(/\$[\d,\.]+/)  // first dollar amount
          if (m) row.currentValue = m[0]
        }

        if (row.symbol && !SKIP_SYMBOLS.includes(row.symbol.toLowerCase())) {
          generic.push(row)
        }
      })
    })
    console.log('[Diag][SoFi] generic parsed rows:', generic.length)
    if (generic.length > 0) rowsOut.push(...generic)
  }

  return rowsOut
}


// helper used by the new "flextable" parser (Fidelity's other UI variant)
function scrapeFlexTableTradeData(allDocs) {
  const out = []

  allDocs.forEach(({ doc, label }) => {
    // table class can change but typically starts with "FlexTable-"; we also
    // match any <tr> that has a data-mjs-value attribute.
    const selector = 'table[class^="FlexTable-"] tr[data-mjs-value]'
    const rows = doc.querySelectorAll(selector)
    if (rows.length) console.log(`[Diag] "${label}" → flex rows:`, rows.length)

    rows.forEach((tr) => {
      const dataAttr = tr.getAttribute('data-mjs-value')
      if (!dataAttr) return

      // parse semi-colon separated key=val pairs
      const pairs = dataAttr.split(";").map(p => p.split("=")).filter(p => p.length === 2)
      const row = {}
      pairs.forEach(([k, v]) => {
        // copy only the fields we care about; keep raw strings for now
        if (k === 'symbol') row.symbol = v
        if (k === 'currentValue') row.currentValue = v
        if (k === 'pctOfAccount') row.pctOfAccount = v
        if (k === 'quantity') row.quantity = v
        if (k === 'costBasis') row.costBasis = v
      })

      if (row.symbol && !SKIP_SYMBOLS.includes(row.symbol.toLowerCase())) {
        out.push(row)
      }
    })
  })

  return out
}

async function scrapeWithRetry(retries = 5, delay = 700) {
  for (let i = 0; i < retries; i++) {
    const data = scrapeTradeData()
    if (data.length > 0) return data
    await new Promise(r => setTimeout(r, delay))
  }
  return []
}
