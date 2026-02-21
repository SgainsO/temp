import './App.css'

function App() {
  function handleClick() {
    alert('Button clicked!')
  }

  return (
    <div className="container">
      <p className="instructions">Instructions here at top</p>
      <button className="action-btn" onClick={handleClick}>
        Click Me
      </button>
    </div>
  )
}

export default App
