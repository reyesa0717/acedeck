// Classifies catalog rows as sealed product (ETB, booster box, packs) vs singles,
// using the Collectr CSV columns first and falling back to the product name.

/**
 * Product kind / Sealed kind columns.
 * @returns {null | "etb" | "booster_bundle" | "booster_box" | "pack" | "bundle" | "other"}
 */
export function inferSealedKindFromProductName(name) {
  const n = (name || "").toLowerCase();
  if (!n) return null;

  if (n.includes("elite trainer box")) return "etb";
  if (/\betb\b/.test(n)) return "etb";
  if (n.includes("booster bundle")) return "booster_bundle";
  if (n.includes("booster box")) return "booster_box";
  if (/\bbooster pack\b/.test(n)) return "pack";
  if (n.includes("build & battle")) return "bundle";
  if (n.includes("ultra premium collection") || /\bpremium collection\b/.test(n)) return "other";
  if (/\btheme deck\b|\bbattle deck\b|\bstarter deck\b/.test(n)) return "other";
  if (/\bblister\b/.test(n)) return "other";
  if (/\bcase\b/.test(n) && (n.includes("booster") || n.includes("display"))) return "other";

  return null;
}

function subcategoryFromSealedKindColumn(sk) {
  const s = (sk || "").toLowerCase().trim();
  if (!s) return null;
  if (s === "elite trainer box" || s === "etb" || s.includes("elite trainer")) return "etb";
  if (s === "booster bundle" || s.includes("booster bundle")) return "booster_bundle";
  if (s === "booster box" || s.includes("booster box")) return "booster_box";
  if (s === "booster pack" || s === "pack" || s.includes("booster pack")) return "pack";
  if (s === "bundle") return "bundle";
  return null;
}

export function isSealedCatalogRow(item) {
  if (!item) return false;
  const pk = (item.productKind || "").toLowerCase().trim();
  if (pk === "sealed") return true;
  const sk = (item.sealedKind || "").toLowerCase().trim();
  if (
    sk &&
    /^(pack|etb|bundle|booster pack|booster bundle|elite trainer box|booster box)$/.test(sk)
  )
    return true;
  return inferSealedKindFromProductName(item.name) != null;
}

/** @returns {null | "etb" | "booster_bundle" | "booster_box" | "pack" | "bundle" | "other"} */
export function getSealedSubcategory(item) {
  if (!isSealedCatalogRow(item)) return null;
  const fromCol = subcategoryFromSealedKindColumn(item.sealedKind);
  if (fromCol) return fromCol;
  const fromName = inferSealedKindFromProductName(item.name);
  if (fromName) return fromName;
  return "other";
}

export function catalogMatchesProductFilter(item, filterKey) {
  if (!filterKey || filterKey === "all") return true;
  if (filterKey === "singles") return !isSealedCatalogRow(item);
  if (filterKey === "sealed") return isSealedCatalogRow(item);
  const sub = getSealedSubcategory(item);
  if (filterKey === "sealed_other") return sub === "other";
  return sub === filterKey;
}
