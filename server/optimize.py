import numpy as np
import yfinance as yf
from scipy.optimize import minimize


def get_close_prices(tickers: list[str], period: str = "1y"):
    data = yf.download(tickers, period=period, auto_adjust=True, progress=False)["Close"]
    if len(tickers) == 1:
        data = data.to_frame(name=tickers[0])
    return data[tickers]  # ensure consistent column order


def get_returns(tickers: list[str], period: str = "1y") -> np.ndarray:
    data = get_close_prices(tickers, period)
    return data.pct_change().dropna().values


def sharpe_ratio(weights: np.ndarray, returns: np.ndarray, risk_free: float = 0.0) -> float:
    port_return = np.dot(returns.mean(axis=0), weights) * 252
    port_vol = np.sqrt(weights @ (np.cov(returns.T) * 252) @ weights)
    return (port_return - risk_free) / port_vol


def neg_sharpe(weights, returns, risk_free):
    return -sharpe_ratio(weights, returns, risk_free)


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


def optimize_sharpe(
    tickers: list[str],
    period: str = "2y",
    risk_free: float = 0.0,
) -> dict:
    """
    Optimize portfolio weights to maximize Sharpe ratio.

    Args:
        tickers:    List of stock ticker symbols.
        period:     Historical data window (e.g. '1y', '2y').
        risk_free:  Annual risk-free rate (decimal, e.g. 0.05 for 5%).

    Returns:
        {
            "tickers":      list of tickers,
            "weights":      optimized weights (sum to 1),
            "sharpe":       maximized Sharpe ratio,
            "annual_return": expected annual return,
            "annual_vol":   expected annual volatility,
        }
    """
    n = len(tickers)
    close_prices = get_close_prices(tickers, period)
    returns = close_prices.pct_change().dropna().values

    x0 = np.full(n, 1.0 / n)           # equal-weight starting point
    bounds = [(0.0, 1.0)] * n           # long-only
    constraints = {"type": "eq", "fun": lambda w: w.sum() - 1.0}

    result = minimize(
        neg_sharpe,
        x0,
        args=(returns, risk_free),
        method="SLSQP",
        bounds=bounds,
        constraints=constraints,
        options={"ftol": 1e-9, "maxiter": 1000},
    )

    if not result.success:
        raise RuntimeError(f"Optimization failed: {result.message}")

    weights = result.x
    sr = sharpe_ratio(weights, returns, risk_free)
    ann_ret = np.dot(returns.mean(axis=0), weights) * 252
    ann_vol = np.sqrt(weights @ (np.cov(returns.T) * 252) @ weights)
    vol_signals = compute_volatility_signals(close_prices)

    return {
        "tickers": tickers,
        "weights": {t: round(float(w), 6) for t, w in zip(tickers, weights)},
        "sharpe": round(float(sr), 6),
        "annual_return": round(float(ann_ret), 6),
        "annual_vol": round(float(ann_vol), 6),
        "volatility_analysis": vol_signals,
    }


if __name__ == "__main__":
    import json, sys

    tickers = sys.argv[1:] if len(sys.argv) > 1 else ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA"]
    result = optimize_sharpe(tickers)
    print(json.dumps(result, indent=2))
