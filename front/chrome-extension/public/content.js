const API_BASE = 'http://localhost:8787'

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
    'max-height:400px',
    'overflow-y:auto',
  ].join(';')

  const title = document.createElement('div')
  title.style.cssText = 'font-size:10px;letter-spacing:0.12em;color:#2e6a9a;text-transform:uppercase;margin-bottom:8px;padding-right:16px;'
  title.textContent = '⬡ Hackalytics — Recommended Allocation'
  panel.appendChild(title)

  const hdr = document.createElement('div')
  hdr.style.cssText = 'display:grid;grid-template-columns:60px 1fr 1fr;gap:8px;font-size:9px;color:#2e4a6a;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:4px;padding-bottom:4px;border-bottom:1px solid #1e3050;'
  hdr.innerHTML = '<span>Ticker</span><span style="text-align:right">Current</span><span style="text-align:right">Target</span>'
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
      curEl.style.cssText = 'text-align:right;color:#4a6a88;'
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
  close.style.cssText = 'position:absolute;top:8px;right:10px;background:none;border:none;color:#2e4a6a;cursor:pointer;font-size:12px;padding:0;'
  close.onclick = () => panel.remove()
  panel.appendChild(close)

  document.body.appendChild(panel)
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

      // Show optimizer deltas in floating panel on the Fidelity page
      runOptimizer(data)

      sendResponse({ data })
    }).catch((err) => {
      console.error('[Hackalytics] Scrape error:', err)
      sendResponse({ data: [], error: String(err) })
    })
  }
  return true
})

// ── Scraping helpers ─────────────────────────────────────────────────────────

const FIELD_MAP = {
  sym:       'symbol',
  curVal:    'currentValue',
  actPer:    'pctOfAccount',
  qty:       'quantity',
  cstBasTot: 'costBasis',
}

const SKIP_SYMBOLS = ['pending activity', 'account total']

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

  return Object.values(rowMap).filter((row) => {
    const sym = (row.symbol || '').toLowerCase()
    return !SKIP_SYMBOLS.includes(sym) && Object.keys(row).length > 0
  })
}

async function scrapeWithRetry(retries = 5, delay = 700) {
  for (let i = 0; i < retries; i++) {
    const data = scrapeTradeData()
    if (data.length > 0) return data
    await new Promise(r => setTimeout(r, delay))
  }
  return []
}
