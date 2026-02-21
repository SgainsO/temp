chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SCRAPE_TRADES') {
    const data = scrapeTradeData()
    console.log('[Trade Scraper] Found', data.length, 'positions:')
    const table = data.map((row) => ({
      Symbol:          row.symbol       || '—',
      'Current Value': row.currentValue || '—',
      '% of Account':  row.pctOfAccount || '—',
      Quantity:        row.quantity     || '—',
      'Cost Basis':    row.costBasis    || '—',
    }))
    console.table(table)
    sendResponse({ data })
  }
  return true
})

const FIELD_MAP = {
  // Symbol
  symbol:               'symbol',
  ticker:               'symbol',
  symbolDescription:    'symbol',
  // Current Value
  marketValue:          'currentValue',
  market_value:         'currentValue',
  currentValue:         'currentValue',
  current_value:        'currentValue',
  // % of Account
  pctOfAccount:         'pctOfAccount',
  pct_of_account:       'pctOfAccount',
  percentOfAccount:     'pctOfAccount',
  // Quantity
  quantity:             'quantity',
  qty:                  'quantity',
  shares:               'quantity',
  // Cost Basis
  costBasis:            'costBasis',
  cost_basis:           'costBasis',
  totalCostBasis:       'costBasis',
}

// Rows to skip (non-position rows)
const SKIP_SYMBOLS = ['pending activity', 'account total', '']

function scrapeTradeData() {
  // ag-grid renders pinned columns and scrollable columns as separate DOM rows
  // but they share the same row-index attribute — group by that to merge them
  const rowMap = {}

  document.querySelectorAll('.ag-row').forEach((row) => {
    const idx = row.getAttribute('row-index')
    if (idx === null) return
    if (!rowMap[idx]) rowMap[idx] = {}

    row.querySelectorAll('[col-id]').forEach((cell) => {
      const colId = cell.getAttribute('col-id')
      if (!colId) return
      // innerText may contain ticker + full name separated by \n — take first line
      const value = cell.innerText.split('\n').map(s => s.trim()).filter(Boolean)[0] || ''
      if (!value) return
      rowMap[idx][colId] = value
      const friendly = FIELD_MAP[colId]
      if (friendly && !rowMap[idx][friendly]) rowMap[idx][friendly] = value
    })
  })

  return Object.values(rowMap).filter((row) => {
    const sym = (row.symbol || '').toLowerCase()
    return !SKIP_SYMBOLS.includes(sym) && Object.keys(row).length > 0
  })
}
