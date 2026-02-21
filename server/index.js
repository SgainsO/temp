import express from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 8787;

// Allow calls from your Vite dev server + extensions
app.use(cors({
  origin: true, // easiest for local dev; tighten later
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"]
}));

app.use(express.json({ limit: "1mb" }));

function cleanHoldings(rawHoldings) {
  if (!Array.isArray(rawHoldings)) return [];

  return rawHoldings
    .map(h => ({
      industry: String(h.industry ?? "").trim() || "Unknown",
      value: Number(h.value)
    }))
    .filter(h => Number.isFinite(h.value) && h.value >= 0);
}

function calcIndustryTotals(holdings) {
  const totals = new Map();
  let totalValue = 0;

  for (const h of holdings) {
    totalValue += h.value;
    totals.set(h.industry, (totals.get(h.industry) ?? 0) + h.value);
  }

  const breakdown = [...totals.entries()]
    .map(([industry, value]) => ({
      industry,
      value,
      weight_pct: totalValue > 0 ? (value / totalValue) * 100 : 0
    }))
    .sort((a, b) => b.value - a.value);

  return { totalValue, breakdown };
}

// HHI on 0..10,000 scale using percent weights
function calcHHI(breakdown) {
  return breakdown.reduce((sum, row) => sum + row.weight_pct * row.weight_pct, 0);
}

// Shannon entropy (natural log) on industry distribution
function calcEntropy(breakdown) {
  // p_i = weight fraction (0..1)
  let ent = 0;
  for (const row of breakdown) {
    const p = row.weight_pct / 100;
    if (p > 0) ent += -p * Math.log(p);
  }
  return ent;
}

function ratingFromHHI(hhi) {
  if (hhi === 0) return "No Data";
  if (hhi < 1500) return "Well Diversified";
  if (hhi < 2500) return "Moderate";
  return "Concentrated";
}

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.post("/api/diversity", (req, res) => {
  const holdings = cleanHoldings(req.body?.holdings);
  const { totalValue, breakdown } = calcIndustryTotals(holdings);

  const hhi = calcHHI(breakdown);
  const entropy = calcEntropy(breakdown);

  // Effective number of industries = exp(entropy)
  const effectiveIndustries = Math.exp(entropy);

  const topIndustryWeight = breakdown.length ? breakdown[0].weight_pct : 0;

  res.json({
    total_value: totalValue,
    industry_breakdown: breakdown.map(r => ({
      ...r,
      value: Number(r.value.toFixed(2)),
      weight_pct: Number(r.weight_pct.toFixed(2))
    })),
    metrics: {
      hhi: Math.round(hhi),
      entropy: Number(entropy.toFixed(4)),
      effective_industries: Number(effectiveIndustries.toFixed(2)),
      top_industry_weight_pct: Number(topIndustryWeight.toFixed(2)),
      rating: ratingFromHHI(hhi)
    }
  });
});

app.listen(PORT, () => {
  console.log(`Local API running on http://localhost:${PORT}`);
});