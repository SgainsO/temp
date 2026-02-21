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

const SKIP_SYMBOLS = ['pending activity', 'account total', 'grand total']
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
