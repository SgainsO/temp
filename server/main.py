import json
import math
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


# ── Dev entry point ───────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8787, reload=True)
