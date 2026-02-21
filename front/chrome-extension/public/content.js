const API_BASE = 'http://localhost:8787'

const FIELD_MAP = {
  sym: 'symbol',
  curVal: 'currentValue',
  actPer: 'pctOfAccount',
  qty: 'quantity',
  cstBasTot: 'costBasis',
}

const FIELD_ALIASES = {
  symbol: ['symbol', 'sym', 'ticker'],
  currentValue: ['currentValue', 'curVal', 'marketValue', 'value', 'totalValue', 'positionValue'],
  pctOfAccount: ['pctOfAccount', 'actPer', 'allocation', 'weight'],
  quantity: ['quantity', 'qty', 'shares'],
  costBasis: ['costBasis', 'cstBasTot', 'cost'],
}

const SKIP_SYMBOLS = new Set(['pending activity', 'account total', '-', '--', ''])

const BROKER_CONFIG = {
  fidelity: { domains: ['fidelity.com'] },
  sofi: { domains: ['sofi.com'] },
}

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
  title.textContent = 'Hackalytics: Recommended Allocation'
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
  close.textContent = 'x'
  close.style.cssText = 'position:absolute;top:8px;right:10px;background:none;border:none;color:#2e4a6a;cursor:pointer;font-size:12px;padding:0;'
  close.onclick = () => panel.remove()
  panel.appendChild(close)

  document.body.appendChild(panel)
}

async function runOptimizer(holdingsData) {
  try {
    const resp = await fetch(`${API_BASE}/api/optimize-from-holdings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: holdingsData }),
    })
    if (!resp.ok) {
      console.warn('[Hackalytics] Optimizer returned', resp.status)
      return
    }
    const result = await resp.json()
    const weights = result.weights
    const curWeights = result.current_weights
    if (!weights || !curWeights) return

    const allocations = {}
    for (const sym of result.tickers) {
      allocations[sym.toUpperCase()] = {
        curPct: (curWeights[sym] ?? 0) * 100,
        optPct: (weights[sym] ?? 0) * 100,
      }
    }
    showAllocationPanel(allocations)
  } catch (err) {
    console.error('[Hackalytics] Optimizer call failed:', err)
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SCRAPE_TRADES') {
    scrapeWithRetry().then((data) => {
      console.log('[Hackalytics] Scraped:', data.length, 'positions')
      if (data.length === 0) {
        sendResponse({ data })
        return
      }

      fetch(`${API_BASE}/api/save-holdings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data }),
      }).catch((err) => console.error('[Hackalytics] Save failed:', err))

      runOptimizer(data)
      sendResponse({ data })
    }).catch((err) => {
      console.error('[Hackalytics] Scrape error:', err)
      sendResponse({ data: [], error: String(err) })
    })
  }
  return true
})

function detectBroker() {
  const host = (location.hostname || '').toLowerCase()
  for (const [broker, cfg] of Object.entries(BROKER_CONFIG)) {
    if (cfg.domains.some((d) => host.includes(d))) return broker
  }
  return 'unknown'
}

function getAllDocuments() {
  const docs = [{ doc: document, label: 'main' }]
  document.querySelectorAll('iframe').forEach((iframe, i) => {
    try {
      if (iframe.contentDocument) {
        docs.push({ doc: iframe.contentDocument, label: `iframe[${i}]` })
      }
    } catch (e) {
      console.log('[Diag] iframe blocked (cross-origin):', iframe.src)
    }
  })
  return docs
}

function normalizeHeader(text) {
  return (text || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9% ]+/g, '')
    .replace(/\s+/g, ' ')
}

function parseCellValue(cell) {
  const raw = cell?.innerText || ''
  return raw.split('\n').map((s) => s.trim()).filter(Boolean)[0] || ''
}

function mapHeaderToField(header) {
  const h = normalizeHeader(header)
  if (h.includes('symbol') || h.includes('ticker')) return 'symbol'
  if (h.includes('market value') || h === 'value' || h.includes('current value') || h.includes('total value')) return 'currentValue'
  if (h.includes('% of') || h.includes('allocation') || h.includes('weight')) return 'pctOfAccount'
  if (h.includes('quantity') || h.includes('shares') || h === 'qty') return 'quantity'
  if (h.includes('cost basis') || h === 'cost') return 'costBasis'
  return null
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value)
  } catch (e) {
    return value
  }
}

function parseDataAttribute(attr) {
  const out = {}
  if (!attr) return out
  attr.split(';').forEach((chunk) => {
    const trimmed = chunk.trim()
    if (!trimmed) return
    const idx = trimmed.indexOf('=')
    if (idx <= 0) return
    const key = trimmed.slice(0, idx).trim()
    const value = safeDecode(trimmed.slice(idx + 1).trim())
    if (!key || !value) return
    const canonical = FIELD_MAP[key] || key
    out[canonical] = value
  })
  return out
}

function normalizeSymbol(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
}

function getCanonicalField(rawKey) {
  const key = String(rawKey || '').trim()
  for (const [canonical, aliases] of Object.entries(FIELD_ALIASES)) {
    if (aliases.includes(key)) return canonical
  }
  return null
}

function normalizeHolding(raw) {
  if (!raw || typeof raw !== 'object') return null
  const row = {}
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined || value === null || value === '') continue
    const canonical = getCanonicalField(key)
    if (!canonical) continue
    row[canonical] = String(value).trim()
  }
  row.symbol = normalizeSymbol(row.symbol)
  if (!row.symbol || SKIP_SYMBOLS.has(row.symbol.toLowerCase())) return null
  return row
}

function mergeRows(rows) {
  const bySymbol = {}
  rows.forEach((row) => {
    const sym = row.symbol
    if (!bySymbol[sym]) {
      bySymbol[sym] = { ...row }
      return
    }
    const existing = bySymbol[sym]
    for (const key of Object.keys(FIELD_ALIASES)) {
      if (!existing[key] && row[key]) existing[key] = row[key]
    }
  })
  return Object.values(bySymbol)
}

function postProcessRows(rows) {
  const normalized = rows.map(normalizeHolding).filter(Boolean)
  return mergeRows(normalized)
}

function scrapeFidelityAgGrid(allDocs) {
  const rowMap = {}
  allDocs.forEach(({ doc }) => {
    doc.querySelectorAll('.ag-row').forEach((row) => {
      const idx = row.getAttribute('row-index')
      if (idx === null) return
      if (!rowMap[idx]) rowMap[idx] = {}
      row.querySelectorAll('[col-id]').forEach((cell) => {
        const colId = cell.getAttribute('col-id')
        if (!colId) return
        const value = parseCellValue(cell)
        if (!value) return
        rowMap[idx][colId] = value
        const friendly = FIELD_MAP[colId]
        if (friendly && !rowMap[idx][friendly]) rowMap[idx][friendly] = value
      })
    })
  })
  const rows = Object.values(rowMap)
  console.log('[Diag] Fidelity ag-grid raw rows:', rows.length)
  return rows
}

function scrapeFidelityFlexTable(allDocs) {
  const out = []
  allDocs.forEach(({ doc, label }) => {
    const rows = doc.querySelectorAll('table[class^="FlexTable-"] tr[data-mjs-value]')
    if (rows.length) console.log(`[Diag] ${label} flex rows:`, rows.length)
    rows.forEach((tr) => {
      out.push(parseDataAttribute(tr.getAttribute('data-mjs-value') || ''))
    })
  })
  return out
}

function scrapeTableByHeaders(allDocs) {
  const out = []
  allDocs.forEach(({ doc, label }) => {
    const tables = Array.from(doc.querySelectorAll('table'))
    if (tables.length) console.log(`[Diag] ${label} table count:`, tables.length)

    tables.forEach((table) => {
      const headers = Array.from(table.querySelectorAll('thead th, tr th')).map((th) => parseCellValue(th))
      if (headers.length === 0) return
      const fieldByCol = headers.map(mapHeaderToField)
      if (!fieldByCol.some(Boolean)) return

      const bodyRows = Array.from(table.querySelectorAll('tbody tr'))
      bodyRows.forEach((tr) => {
        const row = {}
        const cells = Array.from(tr.querySelectorAll('td'))
        cells.forEach((td, i) => {
          const field = fieldByCol[i]
          if (!field) return
          const value = parseCellValue(td)
          if (value) row[field] = value
        })
        if (Object.keys(row).length > 0) out.push(row)
      })
    })
  })
  return out
}

function scrapeSofiCards(allDocs) {
  const out = []
  allDocs.forEach(({ doc, label }) => {
    const items = Array.from(doc.querySelectorAll('[data-mjs-value]'))
    if (items.length) console.log(`[Diag] ${label} data-mjs-value elems:`, items.length)
    items.forEach((el) => {
      const parsed = parseDataAttribute(el.getAttribute('data-mjs-value') || '')
      if (!parsed.symbol) {
        const symMatch = (el.getAttribute('data-mjs-value') || '').match(/symbol=([^;]+)/)
        if (symMatch) parsed.symbol = safeDecode(symMatch[1])
      }
      if (!parsed.quantity) {
        const qtyEl = el.querySelector('[aria-label^="number of shares"]')
        if (qtyEl) parsed.quantity = parseCellValue(qtyEl)
      }
      if (!parsed.currentValue) {
        const valEl = el.querySelector('[aria-label^="Total Value"]')
        if (valEl) parsed.currentValue = parseCellValue(valEl)
      }
      if (!parsed.currentValue) {
        const txt = el.innerText || ''
        const m = txt.match(/\$[\d,]+(?:\.\d+)?/)
        if (m) parsed.currentValue = m[0]
      }
      if (Object.keys(parsed).length > 0) out.push(parsed)
    })
  })
  return out
}

const SCRAPER_PIPELINE = {
  fidelity: [scrapeFidelityAgGrid, scrapeFidelityFlexTable, scrapeTableByHeaders, scrapeSofiCards],
  sofi: [scrapeTableByHeaders, scrapeSofiCards, scrapeFidelityAgGrid, scrapeFidelityFlexTable],
  unknown: [scrapeFidelityAgGrid, scrapeFidelityFlexTable, scrapeTableByHeaders, scrapeSofiCards],
}

function scrapeTradeData() {
  const broker = detectBroker()
  const allDocs = getAllDocuments()
  const pipeline = SCRAPER_PIPELINE[broker] || SCRAPER_PIPELINE.unknown

  console.log('[Diag] detected broker:', broker)
  console.log('[Diag] accessible docs:', allDocs.map((d) => d.label))

  for (const scraper of pipeline) {
    const rawRows = scraper(allDocs)
    const rows = postProcessRows(rawRows)
    if (rows.length > 0) {
      console.log(`[Diag] parser ${scraper.name} returned`, rows.length, 'normalized rows')
      return rows
    }
  }

  return []
}

async function scrapeWithRetry(retries = 5, delay = 700) {
  for (let i = 0; i < retries; i++) {
    const data = scrapeTradeData()
    if (data.length > 0) return data
    await new Promise((r) => setTimeout(r, delay))
  }
  return []
}

window._hackalytics = {
  detectBroker,
  scrapeTradeData,
  scrapeWithRetry,
  scrapeFidelityAgGrid,
  scrapeFidelityFlexTable,
  scrapeTableByHeaders,
  scrapeSofiCards,
}
