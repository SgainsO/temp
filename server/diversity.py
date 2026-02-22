import math
import re
import pandas as pd
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# Load stock market reference data once at import time
# ---------------------------------------------------------------------------
_CSV_PATH = Path(__file__).parent / "stock_market.csv"

try:
    _stock_df = pd.read_csv(_CSV_PATH, dtype=str).fillna("")
    # Build symbol → sector lookup (upper-cased symbols for robust matching)
    _SYMBOL_TO_INDUSTRY: dict[str, str] = dict(
        zip(_stock_df["ticker"].str.upper(), _stock_df["sector"])
    )
    print(f"[diversity] Loaded {len(_SYMBOL_TO_INDUSTRY)} sector mappings from CSV")
except Exception as e:
    print(f"[diversity] CSV load failed: {e}")
    _SYMBOL_TO_INDUSTRY = {}


def clean_holdings(raw_holdings: list) -> list:
    """Normalize incoming holdings into a list of {industry, value} dicts.

    The front‑end scraper sends whatever cells it can find which vary by broker;
    some use "value", others "currentValue"/"curVal" and so on.  Interpret any
    of those fields as the numeric value and strip out dollars/commas.  If no
    numeric field is present or the parsed amount is non‑finite we skip the row.
    """

    def _parse_num(v: Any) -> float:
        # accept ints/floats directly
        if isinstance(v, (int, float)):
            return float(v)
        s = str(v)
        # remove currency symbols, commas, spaces, etc.
        s = re.sub(r"[^0-9.\-]", "", s)
        try:
            return float(s)
        except ValueError:
            return 0.0

    # UI artifact rows with no investment value — always drop
    _SKIP = {"ACCOUNT:", "PENDING ACTIVITY", "ACCOUNT TOTAL", "GRAND TOTAL"}

    # Gold & silver ETFs always map to Natural Resources
    _NATURAL_RESOURCES = {"GLD", "IAU", "SLV", "SIVR", "SGOL", "BAR", "PHYS", "PSLV", "PPLT", "PALL"}

    # Other fixed sector overrides
    _SPECIAL_SECTORS: dict[str, str] = {
        "CASH": "Cash & Equivalents",
    }

    def _is_mutual_fund(sym: str) -> bool:
        # US mutual funds are almost always 5-letter tickers ending in X
        # and won't appear in the stock CSV (which covers ETFs/stocks)
        return len(sym) == 5 and sym.endswith("X") and sym not in _SYMBOL_TO_INDUSTRY

    if not isinstance(raw_holdings, list):
        return []
    result: list[dict[str, Any]] = []
    for h in raw_holdings:
        symbol = str(h.get("symbol", "") or "").strip().upper()

        if symbol in _SKIP:
            continue

        mutual_fund = False

        if symbol in _NATURAL_RESOURCES:
            industry = "Natural Resources"
        elif symbol in _SPECIAL_SECTORS:
            industry = _SPECIAL_SECTORS[symbol]
        elif _is_mutual_fund(symbol):
            industry = "Mutual Funds"
            mutual_fund = True
        else:
            industry = _SYMBOL_TO_INDUSTRY.get(symbol, "")
            if not industry:
                industry = str(h.get("industry", "") or "").strip()
            industry = industry or "Unknown"

        # look for any supported value key
        value_field: Any = None
        for key in ("value", "currentValue", "curVal", "cur_val", "current_value"):
            if key in h:
                value_field = h.get(key)
                break
        if value_field is None:
            continue
        value = _parse_num(value_field)
        if math.isfinite(value) and value >= 0:
            result.append({"symbol": symbol, "industry": industry, "value": value, "mutual_fund": mutual_fund})
    return result


def calc_industry_totals(holdings: list) -> dict:
    totals: dict[str, float] = {}
    total_value = 0.0

    for h in holdings:
        total_value += h["value"]
        totals[h["industry"]] = totals.get(h["industry"], 0.0) + h["value"]

    breakdown = [
        {
            "industry": industry,
            "value": value,
            "weight_pct": (value / total_value * 100) if total_value > 0 else 0.0,
        }
        for industry, value in totals.items()
    ]
    breakdown.sort(key=lambda x: x["value"], reverse=True)
    return {"total_value": total_value, "breakdown": breakdown}


# HHI on 0..10,000 scale using percent weights
def calc_hhi(breakdown: list) -> float:
    return sum(row["weight_pct"] ** 2 for row in breakdown)


# Shannon entropy (natural log) on industry distribution
def calc_entropy(breakdown: list) -> float:
    entropy = 0.0
    for row in breakdown:
        p = row["weight_pct"] / 100
        if p > 0:
            entropy += -p * math.log(p)
    return entropy


def rating_from_hhi(hhi: float) -> str:
    if hhi == 0:
        return "No Data"
    if hhi < 1500:
        return "Well Diversified"
    if hhi < 2500:
        return "Moderate"
    return "Concentrated"


if __name__ == "__main__":
    import json

    test_holdings = [
        {"industry": "Technology", "value": 50000},
        {"industry": "Healthcare", "value": 30000},
        {"industry": "Finance", "value": 20000},
        {"industry": "Energy", "value": 10000},
    ]

    holdings = clean_holdings(test_holdings)
    result = calc_industry_totals(holdings)
    breakdown = result["breakdown"]
    hhi = calc_hhi(breakdown)
    entropy = calc_entropy(breakdown)
    effective_industries = math.exp(entropy) if entropy > 0 else 0
    top_industry_weight = breakdown[0]["weight_pct"] if breakdown else 0

    output = {
        "total_value": result["total_value"],
        "industry_breakdown": [
            {
                "industry": r["industry"],
                "value": round(r["value"], 2),
                "weight_pct": round(r["weight_pct"], 2),
            }
            for r in breakdown
        ],
        "metrics": {
            "hhi": round(hhi),
            "entropy": round(entropy, 4),
            "effective_industries": round(effective_industries, 2),
            "top_industry_weight_pct": round(top_industry_weight, 2),
            "rating": rating_from_hhi(hhi),
        },
    }
    print(json.dumps(output, indent=2))
