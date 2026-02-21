import './App.css'

function App() {
  async function handleScrape() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    chrome.tabs.sendMessage(tab.id, { type: 'SCRAPE_TRADES' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Error:', chrome.runtime.lastError.message)
        return
      }
      console.log('Trade data received:', response?.data)
    })
  }

  return (
    <div className="container">
      <p className="instructions">
        Navigate to your portfolio page, then click the button to print all trade data to the console.
      </p>
      <button className="action-btn" onClick={handleScrape}>
        Scrape Trade Data
      </button>
    </div>
  )
}

export default App
