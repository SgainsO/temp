import csv
import math
import re
from pathlib import Path
from typing import Any

_CSV_PATH = Path(__file__).parent / "stock_market.csv"
_SKIP_SYMBOLS = {"pending activity", "account total", "-", "", "cash", "account:", "grand total"}
_VALUE_KEYS = ("value", "currentValue", "curVal", "cur_val", "current_value")


def _parse_currency(value: Any) -> float:
    if isinstance(value, (int, float)):
        return float(value)
    cleaned = re.sub(r"[^0-9.\-]", "", str(value))
    try:
        return float(cleaned)
    except ValueError:
        return 0.0


def _load_market_rows() -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    with _CSV_PATH.open("r", encoding="utf-8", newline="") as csv_file:
        reader = csv.DictReader(csv_file)
        for row in reader:
            item = {
                "name": (row.get("name") or "").strip(),
                "symbol": (row.get("ticker") or "").strip().upper(),
                "sector": (row.get("sector") or "").strip(),
                "industry": (row.get("industry") or "").strip(),
                "market": (row.get("market") or "").strip(),
            }
            if item["symbol"]:
                rows.append(item)
    return rows


_MARKET_ROWS = _load_market_rows()
_SYMBOL_TO_SECTOR = {row["symbol"]: row["sector"] for row in _MARKET_ROWS}


def _holding_value(row: dict[str, Any]) -> float:
    for key in _VALUE_KEYS:
        if key in row:
            return _parse_currency(row.get(key))
    return 0.0


def _clean_for_diversity(raw_holdings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    cleaned: list[dict[str, Any]] = []
    for row in raw_holdings:
        symbol = str(row.get("symbol", "") or "").strip().upper()
        sector = _SYMBOL_TO_SECTOR.get(symbol) or str(row.get("industry", "") or "").strip() or "Unknown"
        value = _holding_value(row)
        if math.isfinite(value) and value >= 0:
            cleaned.append({"industry": sector, "value": value})
    return cleaned


def _calc_industry_totals(holdings: list[dict[str, Any]]) -> dict[str, Any]:
    totals: dict[str, float] = {}
    total_value = 0.0
    for row in holdings:
        total_value += row["value"]
        totals[row["industry"]] = totals.get(row["industry"], 0.0) + row["value"]

    breakdown = []
    for industry, value in totals.items():
        weight_pct = (value / total_value * 100) if total_value > 0 else 0.0
        breakdown.append({"industry": industry, "value": value, "weight_pct": weight_pct})
    breakdown.sort(key=lambda x: x["value"], reverse=True)

    return {"total_value": total_value, "breakdown": breakdown}


def _calc_hhi(breakdown: list[dict[str, Any]]) -> float:
    return sum(row["weight_pct"] ** 2 for row in breakdown)


def _calc_entropy(breakdown: list[dict[str, Any]]) -> float:
    entropy = 0.0
    for row in breakdown:
        p = row["weight_pct"] / 100
        if p > 0:
            entropy += -p * math.log(p)
    return entropy


def _rating_from_hhi(hhi: float) -> str:
    if hhi == 0:
        return "No Data"
    if hhi < 1500:
        return "Well Diversified"
    if hhi < 2500:
        return "Moderate"
    return "Concentrated"


def format_diversity(raw_holdings: list[dict[str, Any]]) -> dict[str, Any]:
    cleaned = _clean_for_diversity(raw_holdings)
    result = _calc_industry_totals(cleaned)
    breakdown = result["breakdown"]
    total_value = result["total_value"]

    hhi = _calc_hhi(breakdown)
    entropy = _calc_entropy(breakdown)
    effective_industries = math.exp(entropy) if entropy > 0 else 0
    top_industry_weight = breakdown[0]["weight_pct"] if breakdown else 0

    return {
        "total_value": round(total_value, 2),
        "industry_breakdown": [
            {
                "industry": row["industry"],
                "value": round(row["value"], 2),
                "weight_pct": round(row["weight_pct"], 2),
            }
            for row in breakdown
        ],
        "metrics": {
            "hhi": round(hhi),
            "entropy": round(entropy, 4),
            "effective_industries": round(effective_industries, 2),
            "top_industry_weight_pct": round(top_industry_weight, 2),
            "rating": _rating_from_hhi(hhi),
        },
    }


def _extract_weighted_tickers(raw_holdings: list[dict[str, Any]]) -> tuple[list[str], dict[str, float]]:
    symbol_values: dict[str, float] = {}
    for row in raw_holdings:
        symbol = str(row.get("symbol", "") or "").strip().upper()
        if not symbol or symbol.lower() in _SKIP_SYMBOLS:
            continue
        value = _holding_value(row)
        if value <= 0:
            continue
        symbol_values[symbol] = symbol_values.get(symbol, 0.0) + value
    tickers = list(symbol_values.keys())
    return tickers, symbol_values


def _safe_optimize(tickers: list[str], period: str, risk_free: float) -> dict[str, Any]:
    if len(tickers) < 2:
        return {"error": "Need at least 2 tickers for optimization."}
    try:
        from optimize import optimize_sharpe
        return optimize_sharpe(tickers, period=period, risk_free=risk_free)
    except Exception as exc:
        return {"error": str(exc)}


def _safe_volatility(tickers: list[str], period: str) -> dict[str, Any]:
    if not tickers:
        return {"error": "No valid tickers for volatility analysis."}
    try:
        from compute_volatility import analyze_tickers_volatility
        return analyze_tickers_volatility(tickers, period=period)
    except Exception as exc:
        return {"error": str(exc)}


def list_stock_choices(search: str | None = None, sector: str | None = None, limit: int | None = 200) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    search_norm = (search or "").strip().lower()
    sector_norm = (sector or "").strip().lower()

    for item in _MARKET_ROWS:
        if search_norm:
            haystack = f'{item["symbol"]} {item["name"]}'.lower()
            if search_norm not in haystack:
                continue
        if sector_norm and item["sector"].lower() != sector_norm:
            continue
        rows.append(item)

    rows.sort(key=lambda r: (r["symbol"], r["name"]))
    if limit is not None and limit > 0:
        return rows[:limit]
    return rows


def simulate_add_stock(
    holdings: list[dict[str, Any]],
    added_symbol: str,
    added_value: float,
    period: str = "1y",
    risk_free: float = 0.0,
) -> dict[str, Any]:
    symbol = (added_symbol or "").strip().upper()
    if not symbol:
        raise ValueError("added_symbol is required.")
    if added_value <= 0:
        raise ValueError("added_value must be > 0.")

    valid_symbols = {row["symbol"] for row in _MARKET_ROWS}
    if symbol not in valid_symbols:
        raise ValueError(f"{symbol} was not found in stock_market.csv.")

    base_holdings = holdings if isinstance(holdings, list) else []
    simulated_holdings = [*base_holdings, {"symbol": symbol, "currentValue": float(added_value)}]

    base_tickers, base_values = _extract_weighted_tickers(base_holdings)
    sim_tickers, sim_values = _extract_weighted_tickers(simulated_holdings)

    return {
        "input": {
            "added_symbol": symbol,
            "added_value": round(float(added_value), 2),
            "period": period,
            "risk_free": risk_free,
        },
        "baseline": {
            "diversity": format_diversity(base_holdings),
            "optimize": _safe_optimize(base_tickers, period=period, risk_free=risk_free),
            "volatility": _safe_volatility(base_tickers, period=period),
            "tickers": base_tickers,
            "value_by_ticker": {k: round(v, 2) for k, v in base_values.items()},
        },
        "simulated": {
            "diversity": format_diversity(simulated_holdings),
            "optimize": _safe_optimize(sim_tickers, period=period, risk_free=risk_free),
            "volatility": _safe_volatility(sim_tickers, period=period),
            "tickers": sim_tickers,
            "value_by_ticker": {k: round(v, 2) for k, v in sim_values.items()},
        },
    }
