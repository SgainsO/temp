import json
import math
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from diversity import calc_entropy, calc_hhi, calc_industry_totals, clean_holdings, rating_from_hhi
from optimize import optimize_sharpe

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)

HOLDINGS_FILE = Path("holdings.json")


# ── Request models ────────────────────────────────────────────────────────────

class DiversityRequest(BaseModel):
    holdings: list[Any] = []


class OptimizeRequest(BaseModel):
    tickers: list[str]
    period: str = "2y"
    risk_free: float = 0.0


class SaveHoldingsRequest(BaseModel):
    data: list[Any]


class OptimizeFromHoldingsRequest(BaseModel):
    data: list[Any]
    period: str = "2y"
    risk_free: float = 0.0


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"ok": True}


@app.post("/api/diversity")
def diversity(req: DiversityRequest):
    holdings = clean_holdings(req.holdings)
    result = calc_industry_totals(holdings)
    breakdown = result["breakdown"]
    total_value = result["total_value"]

    hhi = calc_hhi(breakdown)
    entropy = calc_entropy(breakdown)
    effective_industries = math.exp(entropy) if entropy > 0 else 0
    top_industry_weight = breakdown[0]["weight_pct"] if breakdown else 0

    return {
        "total_value": total_value,
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


@app.post("/api/optimize")
def optimize(req: OptimizeRequest):
    try:
        result = optimize_sharpe(req.tickers, req.period, req.risk_free)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/save-holdings")
def save_holdings(req: SaveHoldingsRequest):
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "data": req.data,
    }
    with open(HOLDINGS_FILE, "w") as f:
        f.write(json.dumps(entry) + "\n")
    return {"ok": True, "rows_saved": len(req.data)}


def _parse_currency(val: Any) -> float:
    """'$1,234.56' → 1234.56, handles ints/floats too."""
    if isinstance(val, (int, float)):
        return float(val)
    cleaned = re.sub(r"[^\d.]", "", str(val))
    try:
        return float(cleaned)
    except ValueError:
        return 0.0


_SKIP = {"pending activity", "account total", "—", "-", ""}


@app.post("/api/optimize-from-holdings")
def optimize_from_holdings(req: OptimizeFromHoldingsRequest):
    tickers: list[str] = []
    values:  list[float] = []

    for h in req.data:
        sym = str(h.get("symbol", "") or "").strip().upper()
        if sym.lower() in _SKIP or not sym:
            continue
        val = _parse_currency(h.get("currentValue", 0))
        if val > 0:
            tickers.append(sym)
            values.append(val)

    if len(tickers) < 2:
        raise HTTPException(
            status_code=400,
            detail="Need at least 2 positions with a current value to optimize.",
        )

    try:
        result = optimize_sharpe(tickers, req.period, req.risk_free)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    # Renormalize current weights to only the tickers the optimizer actually used
    # (some may have been dropped due to missing/insufficient price data)
    valid_set = set(result["tickers"])
    valid_values = {t: v for t, v in zip(tickers, values) if t in valid_set}
    valid_total = sum(valid_values.values()) or 1.0
    result["current_weights"] = {t: round(v / valid_total, 6) for t, v in valid_values.items()}
    return result


# ── Dev entry point ───────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8787, reload=True)
