import {
  extractCardInfo,
  PREMIUM_ILLUSTRATION_RARITY_RE,
  isSecretSlotCardNumber,
  isPremiumIllustrationRarityText,
  normCardNumForCompare,
  vintageCardNumberVariants,
} from "../../../backend/src/services/scrydex";
import { getCachedCardId } from "../components/CatalogImage";

export function parseNameSlashNumber(q) {
  const trimmed = String(q || "").trim();
  const m = trimmed.match(/^(.+?)\s+(\d+)\s*\/\s*(\d+)\s*$/);
  if (!m) return null;
  return { name: m[1].trim(), left: m[2], right: m[3] };
}

export function mergeSearchById(existing, more) {
  const seen = new Set(existing.map((r) => r?.id).filter(Boolean));
  const out = [...existing];
  for (const r of more || []) {
    if (r?.id && !seen.has(r.id)) {
      seen.add(r.id);
      out.push(r);
    }
  }
  return out;
}

export function filterCatalogRowsForPosQuery(rows, q) {
  const t = String(q || "")
    .trim()
    .toLowerCase();
  if (!t) return [];
  return (rows || []).filter(
    (c) =>
      (c.name || "").toLowerCase().includes(t) ||
      (c.number || "").toLowerCase().includes(t) ||
      (c.set || "").toLowerCase().includes(t)
  );
}

export function cachedTcgToTcgplayerPrices(cached) {
  if (!cached) return [];
  const list =
    Array.isArray(cached.variants) && cached.variants.length ? cached.variants : [cached];
  return list
    .filter((v) => v && (v.variant != null || v.market != null || v.low != null))
    .map((v) => ({
      sub_type_name: v.variant || "Normal",
      market_price: v.market ?? null,
      low_price: v.low ?? null,
      mid_price: v.mid ?? null,
      high_price: v.high ?? null,
    }));
}

export function catalogRowToScanResult(row) {
  const cid = row.cardId || getCachedCardId(row) || null;
  let prices = cachedTcgToTcgplayerPrices(row.cachedTCG);
  const mp = Number(row.marketPrice) || 0;
  if (!prices.length) {
    const mk = mp > 0 ? mp : null;
    prices = [
      {
        sub_type_name: "Normal",
        market_price: mk,
        low_price: mk,
        mid_price: mk,
        high_price: mk,
      },
    ];
  }
  return {
    id: `__catrow_${String(row.id)}`,
    _catalogRow: row,
    _catalogPwId: cid,
    image: row.image || null,
    card_info: {
      name: row.name || "Unknown",
      set_name: row.set || "",
      card_number: row.number || "",
      rarity: row.rarity || "",
      hp: "",
      stage: "",
      card_type: "",
    },
    tcgplayer: { prices },
  };
}

export function pokemonStageBucket(stage) {
  const t = String(stage || "")
    .trim()
    .toLowerCase();
  if (!t) return "unknown";
  if (/\bstage\s*2\b|stage2|restored/.test(t)) return "stage2";
  if (/\bstage\s*1\b|stage1/.test(t)) return "stage1";
  if (/\bstage\s*3\b|stage3/.test(t)) return "stage2";
  if (
    /\bbasic\b|baby|level\s*-?\s*up|legend|break\b|rapid\s*strike|single\s*strike|fusion\b/.test(t)
  )
    return "basic";
  return "unknown";
}

export function cardMatchesScanStageFilter(card, filter) {
  if (filter === "all") return true;
  const b = pokemonStageBucket(extractCardInfo(card).stage);
  if (filter === "basic") return b === "basic" || b === "unknown";
  if (filter === "stage1") return b === "stage1";
  if (filter === "stage2") return b === "stage2";
  if (filter === "evolve") return b === "stage1" || b === "stage2";
  return true;
}

export function cardMatchesScanLangFilter(card, filter) {
  if (filter === "all") return true;
  const i = extractCardInfo(card);
  if (filter === "eng") return i.isEnglish && i.hasTCG;
  if (filter === "intl") return !i.isEnglish || !i.hasTCG;
  return true;
}

export function cardMatchesScanRarityFilter(card, filter) {
  if (filter === "all") return true;
  const r = (extractCardInfo(card).rarity || "").toLowerCase();
  return PREMIUM_ILLUSTRATION_RARITY_RE.test(r);
}

export function cardNameMatchesPosQuery(card, rawQuery) {
  const t = String(rawQuery || "").trim();
  if (!t) return true;
  const parsed = parseNameSlashNumber(t);
  const info = extractCardInfo(card);
  const name = (info.name || "").toLowerCase();
  const setPlusNum = ((info.setName || "") + " " + (info.number || "")).toLowerCase();
  if (parsed) {
    const nm = (parsed.name || "").trim().toLowerCase();
    return !nm || name.includes(nm);
  }
  const words = t
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 0 && !/^\d+\/\d+$/.test(w));
  if (!words.length) return true;
  const letterWords = words.filter((w) => /[a-z]/i.test(w) && w.length >= 3);
  const other = words.filter((w) => !letterWords.includes(w));
  if (!letterWords.length && other.length && other.every((x) => x.length <= 2)) return true;
  if (letterWords.length && !letterWords.every((w) => name.includes(w))) return false;
  if (other.length && !other.every((w) => name.includes(w) || setPlusNum.includes(w))) return false;
  return true;
}

export function normalizeScanCatalogName(name) {
  return String(name || "")
    .toLowerCase()
    .trim()
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s*\[[^\]]*\]\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function speciesLookupKey(name) {
  const n = normalizeScanCatalogName(name);
  if (!n) return "";
  const parts = n.split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  if (parts[0].length >= 6) return parts[0];
  if (parts.length >= 2) {
    const two = parts.slice(0, 2).join(" ");
    if (two.length <= 16) return two;
  }
  return parts[0];
}

export function normSetForLookup(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 96);
}

export function numberTokensForCatalogLookup(numberRaw, setName) {
  const tokens = new Set();
  let base = String(numberRaw || "")
    .trim()
    .replace(/^#+/, "")
    .replace(/\s/g, "");
  if (/\d+\s+of\s+\d+/i.test(base)) {
    base = base.replace(/\s+of\s+/gi, "/");
  }
  if (!base) return tokens;
  const set = setName || "";
  tokens.add(base.toLowerCase());
  const nv = normCardNumForCompare(base);
  if (nv) tokens.add(String(nv).toLowerCase());
  for (const v of vintageCardNumberVariants(set, base)) {
    const vv = String(v || "")
      .trim()
      .replace(/\s/g, "");
    if (!vv) continue;
    tokens.add(vv.toLowerCase());
    const nz = normCardNumForCompare(vv);
    if (nz) tokens.add(String(nz).toLowerCase());
  }
  return tokens;
}

const catalogNoNumSentinel = "__nonum__";

// Builds id / name+number / set+number lookup sets so scan results can be flagged "in your catalog".
export function buildCatalogPwLookup(catalogRows) {
  const ids = new Set();
  const nameNum = new Set();
  const setNum = new Set();
  for (const c of catalogRows || []) {
    const resolved = getCachedCardId(c);
    if (resolved) ids.add(String(resolved));
    if (c?.cardId) ids.add(String(c.cardId));
    const nk = normalizeScanCatalogName(c.name || "");
    const sk = speciesLookupKey(c.name || "");
    const nameKeys = new Set();
    if (nk) nameKeys.add(nk);
    if (sk && sk !== nk) nameKeys.add(sk);
    const toks = numberTokensForCatalogLookup(c.number, c.set);
    for (const nameK of nameKeys) {
      if (toks.size) {
        for (const tok of toks) {
          nameNum.add(nameK + "\0" + tok);
        }
      } else {
        nameNum.add(nameK + "\0" + catalogNoNumSentinel);
      }
    }
    const setSl = normSetForLookup(c.set);
    if (setSl && toks.size) {
      for (const tok of toks) {
        setNum.add(setSl + "\0" + tok);
      }
    }
  }
  return { ids, nameNum, setNum };
}

export function cardMatchesScanCatalogFilter(card, filter, lookup) {
  if (filter === "all") return true;
  if (card?._catalogRow) {
    if (filter === "in") return true;
    if (filter === "out") return false;
    return true;
  }
  const info = extractCardInfo(card);
  const id = info.id != null ? String(info.id) : String(card?.id || "");
  let inCat = !!(id && lookup.ids.has(id));
  if (!inCat) {
    const nh = normalizeScanCatalogName(info.name || "");
    const sh = speciesLookupKey(info.name || "");
    const nameCandidates = new Set();
    if (nh) nameCandidates.add(nh);
    if (sh && sh !== nh) nameCandidates.add(sh);
    for (const nameK of nameCandidates) {
      if (lookup.nameNum.has(nameK + "\0" + catalogNoNumSentinel)) {
        inCat = true;
        break;
      }
      for (const tok of numberTokensForCatalogLookup(info.number, info.setName)) {
        if (lookup.nameNum.has(nameK + "\0" + tok)) {
          inCat = true;
          break;
        }
      }
      if (inCat) break;
    }
    if (!inCat && lookup.setNum?.size) {
      const setSl = normSetForLookup(info.setName);
      if (setSl) {
        for (const tok of numberTokensForCatalogLookup(info.number, info.setName)) {
          if (lookup.setNum.has(setSl + "\0" + tok)) {
            inCat = true;
            break;
          }
        }
      }
    }
  }
  if (filter === "in") return inCat;
  if (filter === "out") return !inCat;
  return true;
}

// Expands the search box text into the name/number permutations Scrydex matches best
// (Example: "Charizard 4/102" also tries "4 of 102", "+ english", and IR/SIR variants).
export function buildPosSearchQueries(q) {
  const trimmed = String(q || "").trim();
  const out = [];
  const seen = new Set();
  function add(s) {
    const t = String(s || "").trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    out.push(t);
  }
  add(trimmed);
  const parsed = parseNameSlashNumber(trimmed);
  if (parsed) {
    const nL = parseInt(parsed.left, 10);
    const nR = parseInt(parsed.right, 10);
    const norm = Number.isFinite(nL) && Number.isFinite(nR) ? `${nL}/${nR}` : null;
    if (norm && norm !== `${parsed.left}/${parsed.right}`) add(`${parsed.name} ${norm}`);
    add(`${parsed.name} ${parsed.left} of ${parsed.right}`);
    if (norm) add(`${parsed.name} ${norm.replace("/", " of ")}`);
    add(`${parsed.name} ${parsed.left}/${parsed.right} english`);
    if (norm) add(`${parsed.name} ${norm} english`);
    add(`${parsed.name} english`);
    if (Number.isFinite(nL) && Number.isFinite(nR) && nL > nR) {
      add(`${parsed.name} ${parsed.left}/${parsed.right} illustration rare`);
      if (norm) add(`${parsed.name} ${norm} illustration rare`);
      add(`${parsed.name} ${parsed.left}/${parsed.right} special illustration rare`);
    }
  } else {
    add(`${trimmed} english`);
    if (
      /\bir\b|\bsir\b|illustration\s*rare|special\s*illustration|special\s*illustr/i.test(
        trimmed.toLowerCase()
      )
    ) {
      add(trimmed.replace(/\s*english\s*$/i, "").trim() + " illustration rare");
    }
  }
  return out;
}

// English prints with USD prices rank first; premium rarities float up when the query implies one.
export function sortPosScanResults(results, userQuery) {
  const qRaw = String(userQuery || "").trim();
  const q = qRaw.toLowerCase();
  const parsedQ = parseNameSlashNumber(qRaw);
  const wantsIrSir =
    /\bir\b|\bsir\b|illustration\s*rare|special\s*illustration|special\s*illustr/i.test(q) ||
    (parsedQ ? isSecretSlotCardNumber(`${parsedQ.left}/${parsedQ.right}`) : false);

  function premiumTier(card) {
    const r = (extractCardInfo(card).rarity || "").toLowerCase();
    if (/illustration\s*rare/.test(r) || /special\s*illustr/.test(r)) return 4;
    if (/hyper\s*rare|secret\s*rare|rainbow/.test(r)) return 3;
    if (/special\s*art|amazing\s*rare|radiant|radiant\s*rare|ace\s*spec/.test(r)) return 2;
    if (/holo\s*rare|holofoil|ultra\s*rare/.test(r)) return 1;
    return 0;
  }

  return [...(results || [])].sort((a, b) => {
    const ia = extractCardInfo(a);
    const ib = extractCardInfo(b);
    const aEng = ia.isEnglish && ia.hasTCG ? 1 : 0;
    const bEng = ib.isEnglish && ib.hasTCG ? 1 : 0;
    if (bEng !== aEng) return bEng - aEng;
    if (ib.hasTCG !== ia.hasTCG) return (ib.hasTCG ? 1 : 0) - (ia.hasTCG ? 1 : 0);
    if (wantsIrSir) {
      const d = premiumTier(b) - premiumTier(a);
      if (d !== 0) return d;
    }
    return 0;
  });
}

export function shouldSupplementEnglishForSingleResult(card) {
  const info = extractCardInfo(card);
  if (info.language === "eng" && info.hasTCG) return false;
  if (info.language === "jap") return true;
  const sn = info.setName || "";
  if (/[぀-ヿ一-鿿]/.test(sn)) return true;
  const low = sn.toLowerCase();
  if (/\bjapanese\b|\bjapan\b|\bjp\b/.test(low)) return true;
  return false;
}

export function englishSupplementQueries(originalQuery, singleResult) {
  const parsed = parseNameSlashNumber(String(originalQuery || "").trim());
  const info = extractCardInfo(singleResult);
  const baseName = (parsed?.name || info.name || "").trim();
  const numFromParsed = parsed ? `${parsed.left}/${parsed.right}` : "";
  const numFromCard = (info.number || "").trim();
  const num = numFromParsed || numFromCard;
  const out = [];
  const seen = new Set();
  function add(s) {
    const t = String(s || "").trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    out.push(t);
  }
  if (baseName && num) {
    add(`${baseName} ${num} english`);
    const m = num.match(/^(\d+)\/(\d+)$/);
    if (m) {
      const norm = `${parseInt(m[1], 10)}/${parseInt(m[2], 10)}`;
      if (norm !== num) add(`${baseName} ${norm} english`);
    }
    if (isSecretSlotCardNumber(num) || isPremiumIllustrationRarityText(info.rarity)) {
      add(`${baseName} ${num} illustration rare`);
      add(`${baseName} ${num} special illustration rare`);
    }
  }
  add(`${String(originalQuery || "").trim()} english`);
  if (baseName) add(`${baseName} english`);
  return out;
}

// Picks the TCG price variant (1st Edition, Shadowless, Holo, Reverse, Normal) matching the row.
export function detectTCGVariantIdx(catalogCard, tcgPrices) {
  const variants = tcgPrices?.variants;
  if (!variants?.length) return 0;
  if (variants.length === 1) return 0;

  const setName = (catalogCard?.set || catalogCard?.setName || "").toLowerCase();
  const variance = (catalogCard?.variance || "").toLowerCase();
  const rarity = (catalogCard?.rarity || "").toLowerCase();
  const cardName = (catalogCard?.name || "").toLowerCase();
  const text = `${variance} ${setName}`;

  const find = (name) => variants.findIndex((v) => v.variant?.toLowerCase() === name.toLowerCase());

  if (/1st.?ed(ition)?/i.test(text)) {
    const i = find("1st Edition");
    if (i >= 0) return i;
  }
  if (/shadowless/i.test(text)) {
    const i = find("Shadowless");
    if (i >= 0) return i;
  }
  if (/unlimited/i.test(text)) {
    const i = find("Unlimited");
    if (i >= 0) return i;
  }

  const premiumRarity =
    PREMIUM_ILLUSTRATION_RARITY_RE.test(rarity) || PREMIUM_ILLUSTRATION_RARITY_RE.test(cardName);
  if (premiumRarity) {
    const holoIdx = find("Holofoil");
    if (holoIdx >= 0) return holoIdx;
    const nonRev = variants.findIndex((v) => !/reverse/i.test(v.variant || ""));
    if (nonRev >= 0) return nonRev;
  }

  if (/reverse/i.test(variance)) {
    const i = find("Reverse Holofoil");
    if (i >= 0) return i;
  }
  if (/holo/i.test(variance) || /holo.?rare/i.test(rarity)) {
    const i = find("Holofoil");
    if (i >= 0) return i;
  }
  if (/normal/i.test(variance) || /\b(common|uncommon)\b/i.test(rarity)) {
    const i = find("Normal");
    if (i >= 0) return i;
  }

  return 0;
}

export function preferPremiumTcgVariantIdx(tcgPrices, rarity, cardName) {
  const variants = tcgPrices?.variants || (tcgPrices ? [tcgPrices] : []);
  if (variants.length < 2) return null;
  const r = (rarity || "").toLowerCase();
  const n = (cardName || "").toLowerCase();
  if (!PREMIUM_ILLUSTRATION_RARITY_RE.test(r) && !PREMIUM_ILLUSTRATION_RARITY_RE.test(n))
    return null;
  let bestI = 0,
    bestM = -1;
  for (let i = 0; i < variants.length; i++) {
    const m = Number(variants[i]?.market);
    if (Number.isFinite(m) && m > bestM) {
      bestM = m;
      bestI = i;
    }
  }
  if (bestM < 15) return null;
  return bestI;
}

// detectTCGVariantIdx, but bumps to the higher-priced premium variant for illustration rares
// unless the card is a vintage print locked to a specific edition.
export function resolveTCGVariantIdx(catalogCard, apiCardInfo, tcgPrices) {
  const probe = catalogCard || {
    name: apiCardInfo?.name || "",
    rarity: apiCardInfo?.rarity || "",
    variance: "",
    set: apiCardInfo?.setName || "",
    setName: apiCardInfo?.setName || "",
  };
  const editionHint =
    `${probe.variance || ""} ${probe.set || ""} ${probe.setName || ""}`.toLowerCase();
  const vintageLocked = /\bunlimited\b|shadowless|1st\s*ed|first\s*ed/.test(editionHint);

  let vi = detectTCGVariantIdx(probe, tcgPrices);
  if (!vintageLocked) {
    const alt = preferPremiumTcgVariantIdx(tcgPrices, probe.rarity, probe.name);
    if (alt != null && tcgPrices?.variants?.[alt]) {
      const curM = Number(tcgPrices.variants[vi]?.market) || 0;
      const altM = Number(tcgPrices.variants[alt]?.market) || 0;
      if (altM > curM * 1.8 && altM > 15) vi = alt;
    }
  }
  return vi;
}

export function maxTcgMarketAcrossVariants(tcg) {
  if (!tcg) return 0;
  const variants = tcg?.variants || [tcg];
  return variants.reduce((mx, v) => {
    const x = Number(v?.market);
    return Number.isFinite(x) && x > mx ? x : mx;
  }, 0);
}

export function mergeTcgPreferHigher(detailTcg, searchFallbackTcg) {
  const d = detailTcg;
  const f = searchFallbackTcg;
  if (!f) return d;
  if (!d) return f;
  return maxTcgMarketAcrossVariants(f) > maxTcgMarketAcrossVariants(d) ? f : d;
}
