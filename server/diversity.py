import math


def clean_holdings(raw_holdings: list) -> list:
    if not isinstance(raw_holdings, list):
        return []
    result = []
    for h in raw_holdings:
        industry = str(h.get("industry", "") or "").strip() or "Unknown"
        try:
            value = float(h.get("value", 0))
        except (TypeError, ValueError):
            continue
        if math.isfinite(value) and value >= 0:
            result.append({"industry": industry, "value": value})
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
