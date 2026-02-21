chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SCRAPE_TRADES') {
    scrapeWithRetry().then((data) => {
      console.log('[Trade Scraper] Final result:', data.length, 'positions')
      if (data.length === 0) {
        console.warn('[Trade Scraper] No data — make sure the portfolio grid is fully visible.')
        sendResponse({ data })
        return
      }
      const table = data.map((row) => ({
        Symbol:          row.symbol       || '—',
        'Current Value': row.currentValue || '—',
        '% of Account':  row.pctOfAccount || '—',
        Quantity:        row.quantity     || '—',
        'Cost Basis':    row.costBasis    || '—',
      }))
      console.table(table)
      sendResponse({ data })
    }).catch((err) => {
      console.error('[Trade Scraper] Uncaught error:', err)
      sendResponse({ data: [], error: String(err) })
    })
  }
  return true
})

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
        docs.push({ doc: iframe.contentDocument, label: `iframe[${i}] src=${iframe.src || 'none'}` })
      }
    } catch (e) {
      console.log(`[Diag] iframe[${i}] blocked (cross-origin):`, iframe.src)
    }
  })
  return docs
}

function scrapeTradeData() {
  const allDocs = getAllDocuments()
  console.log('[Diag] documents accessible:', allDocs.map(d => d.label))

  const rowMap = {}

  allDocs.forEach(({ doc, label }) => {
    const agRows = doc.querySelectorAll('.ag-row')
    console.log(`[Diag] "${label}" → .ag-row count:`, agRows.length)

    agRows.forEach((row) => {
      const idx = row.getAttribute('row-index')
      if (idx === null) {
        console.log('[Diag] row missing row-index attr, skipping')
        return
      }
      if (!rowMap[idx]) rowMap[idx] = {}

      row.querySelectorAll('[col-id]').forEach((cell) => {
        const colId = cell.getAttribute('col-id')
        if (!colId) return
        const raw = cell.innerText || ''
        const value = raw.split('\n').map(s => s.trim()).filter(Boolean)[0] || ''
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

  const filtered = allRows.filter((row) => {
    const sym = (row.symbol || '').toLowerCase()
    return !SKIP_SYMBOLS.includes(sym) && Object.keys(row).length > 0
  })
  console.log('[Diag] after filter:', filtered.length, 'rows remain')
  return filtered
}

async function scrapeWithRetry(retries = 5, delay = 700) {
  for (let i = 0; i < retries; i++) {
    const data = scrapeTradeData()
    if (data.length > 0) return data
    console.log(`[Trade Scraper] Grid not ready, retrying (${i + 1}/${retries})...`)
    await new Promise(r => setTimeout(r, delay))
  }
  return []
}
