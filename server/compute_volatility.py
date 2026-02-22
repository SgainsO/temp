import numpy as np
import yfinance as yf


def get_close_prices(tickers: list[str], period: str = "1y"):
    data = yf.download(tickers, period=period, auto_adjust=True, progress=False)["Close"]
    if len(tickers) == 1:
        data = data.to_frame(name=tickers[0])
    available = [t for t in tickers if t in data.columns]
    return data[available]


def compute_volatility_signals(close_prices) -> dict:
    daily_returns = close_prices.pct_change().dropna()
    if daily_returns.empty:
        return {
            "annualized_volatility": {},
            "spike_tickers": [],
            "portfolio_risk_alert": None,
        }

    vol20 = daily_returns.rolling(20).std().iloc[-1] * np.sqrt(252)
    vol120 = daily_returns.rolling(120).std().iloc[-1] * np.sqrt(252)

    ticker_metrics = {}
    spike_tickers = []

    for ticker in daily_returns.columns:
        v20 = vol20.get(ticker, np.nan)
        v120 = vol120.get(ticker, np.nan)
        spike = bool(np.isfinite(v20) and np.isfinite(v120) and v20 > 1.5 * v120)

        if spike:
            spike_tickers.append(ticker)

        ticker_metrics[ticker] = {
            "vol20": round(float(v20), 6) if np.isfinite(v20) else None,
            "vol120": round(float(v120), 6) if np.isfinite(v120) else None,
            "volatility_spike": spike,
        }

    risk_alert = None
    if spike_tickers:
        joined = ", ".join(spike_tickers)
        risk_alert = f"Volatility spike in {joined}; portfolio risk elevated."

    return {
        "annualized_volatility": ticker_metrics,
        "spike_tickers": spike_tickers,
        "portfolio_risk_alert": risk_alert,
    }


def analyze_tickers_volatility(tickers: list[str], period: str = "1y") -> dict:
    close_prices = get_close_prices(tickers, period)
    return {
        "tickers": tickers,
        "period": period,
        "volatility_analysis": compute_volatility_signals(close_prices),
    }


if __name__ == "__main__":
    import json
    import sys

    tickers = sys.argv[1:] if len(sys.argv) > 1 else ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA"]
    result = analyze_tickers_volatility(tickers, period="1y")
    print(json.dumps(result, indent=2))
