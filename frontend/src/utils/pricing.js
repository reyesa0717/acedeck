import { PREMIUM_ILLUSTRATION_RARITY_RE } from "../../../backend/src/services/scrydex";

export const PSA_DEFAULT_GRADES = ["10", "9", "8", "7", "6", "5", "4", "3", "2", "1"];

// Rough multiple of a card's raw Near Mint price for each PSA grade, from observed sales.
// Used to estimate graded value when the API has no live graded price for that grade.
export const PSA_MULTIPLIERS = {
  10: 9.82,
  9.5: 5.0,
  9: 2.78,
  8.5: 2.1,
  8: 1.55,
  7.5: 1.2,
  7: 1.05,
  6.5: 0.92,
  6: 0.85,
  5.5: 0.72,
  5: 0.65,
  4.5: 0.55,
  4: 0.5,
  3.5: 0.42,
  3: 0.38,
  2.5: 0.32,
  2: 0.28,
  1.5: 0.22,
  1: 0.2,
};

export const COMPANY_ORDER = ["PSA", "BGS", "CGC", "TAG", "ACE", "SGC"];

export const COMPANY_COLORS = {
  PSA: "#FACC15",
  BGS: "#60A5FA",
  CGC: "#A78BFA",
  TAG: "#34D399",
  ACE: "#F472B6",
  SGC: "#FB923C",
};

export const VARIANT_LABELS_SHORT = {
  firstEditionShadowlessHolofoil: "1st Shdw",
  unlimitedShadowlessHolofoil: "Shdwless",
  firstEditionHolofoil: "1st Holo",
  unlimitedHolofoil: "Holo",
  firstEditionNormal: "1st Nrml",
  unlimitedNormal: "Unltd",
  reverseHolofoil: "Rev Holo",
  holofoil: "Holo",
  normal: "Normal",
};

export const VARIANT_LABELS_FULL = {
  firstEditionShadowlessHolofoil: "1st Edition Shadowless Holofoil",
  unlimitedShadowlessHolofoil: "Unlimited Shadowless Holofoil",
  firstEditionHolofoil: "1st Edition Holofoil",
  unlimitedHolofoil: "Unlimited Holofoil",
  firstEditionNormal: "1st Edition Normal",
  unlimitedNormal: "Unlimited Normal",
  reverseHolofoil: "Reverse Holofoil",
  holofoil: "Holofoil",
  normal: "Normal",
};

export function formatUsdLabel(v) {
  if (v == null || v === "") return "—";
  const n = Number(v);
  return Number.isFinite(n) ? "$" + n.toFixed(2) : "—";
}

export function trendPercent(trends, key) {
  const pc = Number(trends?.[key]?.percent_change);
  return Number.isFinite(pc) ? pc : null;
}

export function trendDollarChange(trends, key) {
  const v = Number(trends?.[key]?.price_change);
  return Number.isFinite(v) ? v : null;
}

export function formatTrendDollar(trends, key) {
  const dollars = trendDollarChange(trends, key);
  if (dollars == null) return null;
  return (dollars >= 0 ? "+$" : "-$") + Math.abs(dollars).toFixed(2);
}

export function formatTrendPercent(trends, key) {
  const pc = trendPercent(trends, key);
  if (pc == null) return null;
  return (pc >= 0 ? "+" : "-") + Math.abs(pc).toFixed(1) + "%";
}

export function trendColor(trends, key, neutral) {
  const pc = trendPercent(trends, key);
  if (pc == null) return neutral;
  return pc >= 0 ? "#4ade80" : "#f87171";
}

function tcgMarketUndercutsPremiumCatalog(tcgMkt, csvMkt, rarity) {
  if (tcgMkt <= 0 || !Number.isFinite(csvMkt) || csvMkt < 35) return false;
  if (!PREMIUM_ILLUSTRATION_RARITY_RE.test((rarity || "").toLowerCase())) return false;
  return csvMkt / tcgMkt >= 2.2 && tcgMkt < csvMkt * 0.55;
}

// Detects when the TCGplayer market price is almost certainly the wrong variant: it sits
// far below CardMarket/CSV signals, so we fall back to those instead of trusting it.
export function tcgMarketSuspiciousVsSignals(tcgMkt, cmTrend, csvMkt, rarity) {
  if (tcgMkt <= 0) return false;
  if (cmTrend > 30 && cmTrend / tcgMkt > 50) return true;
  if (csvMkt > 30 && csvMkt / tcgMkt > 50) return true;
  if (tcgMarketUndercutsPremiumCatalog(tcgMkt, csvMkt, rarity)) return true;
  return false;
}
