import numpy as np
import pandas as pd
import yfinance as yf

MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
               'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']


def get_close_prices(tickers: list[str], period: str = "1y"):
    data = yf.download(tickers, period=period, auto_adjust=True, progress=False)["Close"]
    if len(tickers) == 1:
        data = data.to_frame(name=tickers[0])
    available = [t for t in tickers if t in data.columns]
    return data[available]


def compute_monthly_spike_patterns(tickers: list[str]) -> dict:
    """
    Download 5 years of data and return per-ticker list of calendar months
    where each stock historically tends to spike.

    Months where most stocks moved together (external macro events) are
    excluded silently — if >60% of stocks moved >3% in the same direction
    in a given month, that month-year is treated as an external event and
    dropped from individual analysis.
    """
    close_5y = get_close_prices(tickers, period="5y")
    if close_5y.empty:
        return {t: [] for t in tickers}

    monthly = close_5y.resample('ME').last()
    monthly_returns = monthly.pct_change().dropna()

    if monthly_returns.empty or len(monthly_returns) < 6:
        return {t: [] for t in tickers}

    n = len(monthly_returns.columns)

    # Detect external event months
    external = pd.Series(False, index=monthly_returns.index)
    if n >= 3:
        for date, row in monthly_returns.iterrows():
            vals = row.dropna()
            if len(vals) < max(3, n * 0.5):
                continue
            big_up   = (vals >  0.03).sum() / len(vals)
            big_down = (vals < -0.03).sum() / len(vals)
            if big_up > 0.6 or big_down > 0.6:
                external[date] = True

    filtered = monthly_returns[~external]

    result = {}
    for ticker in tickers:
        if ticker not in filtered.columns:
            result[ticker] = []
            continue

        series = filtered[ticker].dropna()
        if len(series) < 4:
            result[ticker] = []
            continue

        monthly_avg   = series.groupby(series.index.month).mean()
        monthly_count = series.groupby(series.index.month).count()

        spike_months = []
        for month_num, avg_ret in monthly_avg.items():
            if monthly_count.get(month_num, 0) < 2:
                continue
            if abs(avg_ret) > 0.02:  # >2% average move in that month
                spike_months.append({
                    "month":     MONTH_NAMES[month_num - 1],
                    "direction": "up" if avg_ret > 0 else "down",
                    "avg_pct":   round(avg_ret * 100, 1),
                })

        spike_months.sort(key=lambda x: abs(x["avg_pct"]), reverse=True)
        result[ticker] = spike_months[:4]

    return result


def compute_volatility_signals(close_prices, monthly_patterns=None) -> dict:
    daily_returns = close_prices.pct_change().dropna()
    if daily_returns.empty:
        return {
            "annualized_volatility": {},
            "spike_tickers": [],
            "portfolio_risk_alert": None,
        }

    vol20  = daily_returns.rolling(20).std().iloc[-1]  * np.sqrt(252)
    vol120 = daily_returns.rolling(120).std().iloc[-1] * np.sqrt(252)
    ret20  = (1 + daily_returns).rolling(20).apply(np.prod, raw=True).iloc[-1] - 1

    ticker_metrics = {}
    spike_tickers  = []

    for ticker in daily_returns.columns:
        v20  = vol20.get(ticker, np.nan)
        v120 = vol120.get(ticker, np.nan)
        spike = bool(np.isfinite(v20) and np.isfinite(v120) and v20 > 1.5 * v120)

        if spike:
            spike_tickers.append(ticker)

        r20 = ret20.get(ticker, np.nan)
        spike_direction = ("up" if r20 >= 0 else "down") if (spike and np.isfinite(r20)) else None

        ticker_metrics[ticker] = {
            "vol20":            round(float(v20),  6) if np.isfinite(v20)  else None,
            "vol120":           round(float(v120), 6) if np.isfinite(v120) else None,
            "volatility_spike": spike,
            "spike_direction":  spike_direction,
            "spike_months":     (monthly_patterns or {}).get(ticker, []),
        }

    risk_alert = None
    if spike_tickers:
        joined = ", ".join(spike_tickers)
        risk_alert = f"Volatility spike in {joined}; portfolio risk elevated."

    return {
        "annualized_volatility": ticker_metrics,
        "spike_tickers":         spike_tickers,
        "portfolio_risk_alert":  risk_alert,
    }


def analyze_tickers_volatility(tickers: list[str], period: str = "1y") -> dict:
    close_prices     = get_close_prices(tickers, period)
    monthly_patterns = compute_monthly_spike_patterns(tickers)
    return {
        "tickers":             tickers,
        "period":              period,
        "volatility_analysis": compute_volatility_signals(close_prices, monthly_patterns),
    }


if __name__ == "__main__":
    import json
    import sys

    tickers = sys.argv[1:] if len(sys.argv) > 1 else ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA"]
    result = analyze_tickers_volatility(tickers, period="1y")
    print(json.dumps(result, indent=2))
