import { useState, useEffect } from 'react'
import './App.css'

function App() {
  const [holdings, setHoldings] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Automatically send to Python backend whenever holdings are updated (via scrape or manual)
  useEffect(() => {
    if (holdings.length > 0) {
      sendToPythonBackend(holdings);
    } else {
      setResult(null);
    }
  }, [holdings]);

  // 1. The Scraper Trigger (Talks to Fidelity via content.js)
  const handleScrape = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab.url.includes('fidelity.com')) {
        throw new Error("Please open a Fidelity positions page first.");
      }

      // Send message to content.js to start scraping
      chrome.tabs.sendMessage(tab.id, { action: "SCRAPE_FIDELITY" }, (response) => {
        if (chrome.runtime.lastError) {
          setError("Content script not loaded. Refresh the Fidelity page.");
          setLoading(false);
          return;
        }
        
        if (response && response.data) {
          setHoldings(response.data); // This triggers the useEffect to call Python
        } else {
          setError("No data found on page. Ensure you are on the Positions tab.");
          setLoading(false);
        }
      });
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  // 2. The Python API Call
  const sendToPythonBackend = async (data) => {
    setLoading(true);
    try {
      const resp = await fetch('http://localhost:8787/api/diversity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ holdings: data })
      });
      
      if (!resp.ok) throw new Error(`Python Server Error: ${resp.status}`);
      
      const analysis = await resp.json();
      setResult(analysis);
    } catch (err) {
      setError("Python backend unreachable. Run 'python index.py' in /server/src");
    } finally {
      setLoading(false);
    }
  };

  const statusColor = {
    'Well Diversified': '#10b981',
    'Moderate': '#f59e0b',
    'Concentrated': '#ef4444',
    'No Data': '#666'
  };

  return (
    <div className="container">
      <h3 style={{ margin: '0 0 4px 0', fontSize: '16px' }}>Fidelity Diversity</h3>
      <p className="instructions" style={{ marginBottom: '8px' }}>Analyze your current positions.</p>

      {/* Main Action Button */}
      <button 
        className="action-btn" 
        onClick={handleScrape} 
        disabled={loading}
        style={{ width: '100%', marginBottom: '12px' }}
      >
        {loading ? 'Processing...' : 'Scrape Fidelity Data'}
      </button>

      {error && <p style={{ color: '#ef4444', fontSize: '11px', marginBottom: '8px' }}>{error}</p>}

      {/* Results from Python Backend */}
      {result && (
        <div style={{
          padding: '12px',
          borderRadius: '8px',
          backgroundColor: '#f9fafb',
          border: `2px solid ${statusColor[result.metrics.rating] || '#666'}`,
          textAlign: 'center',
          marginBottom: '12px'
        }}>
          <div style={{ fontSize: '10px', color: '#666', textTransform: 'uppercase' }}>Diversity Rating</div>
          <div style={{ fontSize: '18px', fontWeight: 'bold', color: statusColor[result.metrics.rating] }}>
            {result.metrics.rating}
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', marginTop: '8px', fontSize: '11px', color: '#444' }}>
            <div style={{ textAlign: 'left' }}>HHI: <b>{result.metrics.hhi}</b></div>
            <div style={{ textAlign: 'right' }}>Eff. Sectors: <b>{result.metrics.effective_industries}</b></div>
            <div style={{ textAlign: 'left' }}>Total: <b>${result.total_value.toLocaleString()}</b></div>
            <div style={{ textAlign: 'right' }}>Top: <b>{result.metrics.top_industry_weight_pct}%</b></div>
          </div>
        </div>
      )}

      {/* Breakdown List */}
      {result && result.industry_breakdown.length > 0 && (
        <div style={{ borderTop: '1px solid #eee', paddingTop: '8px' }}>
          <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#666', marginBottom: '4px' }}>Sector Breakdown:</div>
          {result.industry_breakdown.slice(0, 5).map((item, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', padding: '2px 0' }}>
              <span style={{ color: '#333' }}>{item.industry}</span>
              <span style={{ fontWeight: 'bold' }}>{item.weight_pct}%</span>
            </div>
          ))}
          {result.industry_breakdown.length > 5 && (
            <div style={{ fontSize: '10px', color: '#999', textAlign: 'center', marginTop: '4px' }}>
              + {result.industry_breakdown.length - 5} more sectors
            </div>
          )}
        </div>
      )}
      
      {!result && !loading && (
        <div style={{ textAlign: 'center', padding: '20px', color: '#999', fontSize: '12px', border: '1px dashed #ccc', borderRadius: '8px' }}>
          No data loaded yet.
        </div>
      )}
    </div>
  )
}

export default App