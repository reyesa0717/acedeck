// Resolves a catalog row to its Scrydex card id (matching by name/number/set), caches the
// result, and renders the card image with a skeleton fallback while it loads.
import React, { useState, useEffect, useRef } from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  searchCards,
  normCardNumForCompare,
  catalogTcgAffinityBonus,
  vintageCardNumberVariants,
  isSecretSlotCardNumber,
  isPremiumIllustrationRarityText,
  PREMIUM_ILLUSTRATION_RARITY_RE,
  getScrydexApiState,
} from "../../../backend/src/services/scrydex";
import { enqueueImageTask } from "../services/imageQueue";
import { getSetList } from "../../../backend/src/services/setCache";
import PokeImage from "./PokeImage";
import CardSkeleton from "./CardSkeleton";
import { isSealedCatalogRow } from "../utils/sealedInventory";

const idMemCache = {};
const CACHE_VERSION = "v20";

function cacheKey(item) {
  if (!item?.name) return null;
  const n = item.name.toLowerCase().trim().replace(/\s+/g, "_");
  const num = (item.number || "").replace(/\//g, "-").replace(/\s+/g, "");
  const setSlug = normSet(item.set || "")
    .replace(/\s+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 72);
  const tail = num ? n + "_" + num : n;
  return CACHE_VERSION + "_cat_id_" + (setSlug ? setSlug + "__" + tail : tail);
}

let _setList = null;

async function getSetListCached() {
  if (_setList) return _setList;
  try {
    _setList = await getSetList("");
  } catch {
    _setList = [];
  }
  return _setList;
}

function normSet(s) {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const SET_STOP = new Set(["set", "the", "and", "for", "with", "from", "pokemon", "card", "cards"]);

function findSetId(itemSet, itemNumber, setList, itemLang = "eng") {
  if (!itemSet || !setList?.length) return null;

  const normItem = normSet(itemSet);
  const itemWords = normItem.split(" ").filter((w) => w.length > 2 && !SET_STOP.has(w));

  const denom = itemNumber?.includes("/") ? parseInt(itemNumber.split("/")[1], 10) : null;

  let bestId = null;
  let bestScore = 0;

  for (const s of setList) {
    if (itemLang === "eng" && s.language && s.language !== "eng") continue;
    if (itemLang !== "eng" && s.language === "eng") continue;

    const normName = normSet(s.name);
    const nameWords = normName.split(" ").filter((w) => w.length > 2 && !SET_STOP.has(w));

    let score = 0;

    for (const w of itemWords) {
      if (nameWords.includes(w)) score += 10;
    }

    if (normItem === normName) score += 100;
    else if (normItem.includes(normName) || normName.includes(normItem)) score += 50;

    if (denom && s.card_count > 0 && s.card_count === denom) score += 30;
    if (/unlimited/i.test(itemSet) && /unlimited/i.test(s.name)) score += 35;
    if (/(^|\s)(1st|first)\s+edition/i.test(itemSet) && /(1st|first)\s+edition/i.test(s.name))
      score += 35;
    if (/shadowless/i.test(itemSet) && /shadowless/i.test(s.name)) score += 35;

    if (score > bestScore) {
      bestScore = score;
      bestId = s.set_id;
    }
  }

  return bestScore >= 20 ? bestId : null;
}

function detectItemLanguage(item) {
  const text = (item.set || "") + " " + (item.name || "");
  if (/[ぁ-ん゛-゜ァ-ン]/.test(text)) return "jap";
  if (/japanese|japan/i.test(text)) return "jap";
  if (/\bJP\b/.test(text)) return "jap";
  ("Promos JP");
  if (/chinese|china|simplified|traditional|chn/i.test(text)) return "chn";
  if (/[一-鿿㐀-䶿]/.test(text)) return "chn";
  return "eng";
}

// Scrydex cards carry language_code directly so no set-map lookup is needed.
function resultLanguage(result) {
  const code = (result?.language_code || result?.expansion?.language_code || "EN").toUpperCase();
  if (code === "EN") return "eng";
  if (code === "JA") return "jap";
  return "other";
}

const DEBUG_IMAGES = false;

const STOP_WORDS = new Set(["set", "the", "and", "for", "with", "from", "pokemon", "cards"]);

function mergeCatSearchById(existing, more) {
  const ex = existing || [];
  const seen = new Set(ex.map((x) => x?.id).filter(Boolean));
  const out = [...ex];
  for (const x of more || []) {
    if (x?.id && !seen.has(x.id)) {
      seen.add(x.id);
      out.push(x);
    }
  }
  return out;
}

async function pickBest(results, item) {
  if (!results?.length) return null;

  const expectedLang = detectItemLanguage(item);
  const langMatched = results.filter((r) => resultLanguage(r) === expectedLang);

  if (DEBUG_IMAGES) {
    console.log(
      "\n🔍 CARD MATCH: " +
        item.name +
        " | set: " +
        (item.set || "?") +
        " | #" +
        (item.number || "?") +
        " | expected lang: " +
        expectedLang
    );
    console.log(
      "   API returned " + results.length + " results, " + langMatched.length + " match language"
    );
  }

  const pool = langMatched.length > 0 ? langMatched : results;

  if (pool.length === 1) {
    if (DEBUG_IMAGES) console.log("   ✅ Only 1 candidate");
    return pool[0];
  }

  return scorePool(pool, item);
}

function scorePool(pool, item) {
  if (!pool?.length) return null;
  if (pool.length === 1) return pool[0];

  let best = pool[0];
  let bestScore = -999;
  const scores = [];

  const itemSet = normSet(item.set || "");
  const itemNum = (item.number || "").replace(/\s/g, "");
  const inputName = (item.name || "")
    .toLowerCase()
    .trim()
    .replace(/\s*\(.*?\)\s*/g, "")
    .replace(/\s+/g, " ");

  for (const r of pool) {
    let score = 0;
    // Scrydex card fields: r.name, r.expansion.name, r.number, r.rarity, r.variants
    const setName = normSet(r.expansion?.name || "");
    const scoreLog = [];

    if (inputName) {
      const resultName = (r.name || "").toLowerCase().trim();
      if (
        resultName === inputName ||
        resultName.startsWith(inputName + " ") ||
        resultName.startsWith(inputName + "-")
      ) {
        score += 500;
        scoreLog.push("exactName+500");
      } else if (resultName.includes(inputName) || inputName.includes(resultName.split(" ")[0])) {
        score += 150;
        scoreLog.push("partName+150");
      } else {
        score -= 400;
        scoreLog.push("nameMiss-400");
      }
    }

    const hasUsdPrices = (r.variants || []).some((v) =>
      (v.prices || []).some((p) => p.currency === "USD")
    );
    if (hasUsdPrices) {
      score += 150;
      scoreLog.push("usd+150");
    }

    const aff = catalogTcgAffinityBonus(item, r);
    if (aff) {
      score += aff;
      scoreLog.push("tcgAff+" + aff);
    }

    if (itemSet) {
      const words = itemSet.split(/\s+/).filter((w) => w.length > 2 && !STOP_WORDS.has(w));
      for (const w of words) {
        if (setName.includes(w)) {
          score += 60;
          scoreLog.push("word[" + w + "]+60");
        } else {
          score -= 20;
          scoreLog.push("miss[" + w + "]-20");
        }
      }
      if (itemSet.length > 3) {
        if (setName === itemSet) {
          score += 300;
          scoreLog.push("exactSet+300");
        } else if (
          setName.startsWith(itemSet + " ") ||
          setName.endsWith(" " + itemSet) ||
          setName.includes(" " + itemSet + " ")
        ) {
          score += 200;
          scoreLog.push("wordBoundSet+200");
        } else if (setName.includes(itemSet)) {
          score += 80;
          scoreLog.push("subSet+80");
        }
      }
      for (const d of itemSet.match(/\d+/g) || []) {
        if (d.length >= 2 && setName.includes(d)) {
          score += 40;
          scoreLog.push("digit[" + d + "]+40");
        }
      }
    }

    const resultNum = (r.number || "").replace(/\s/g, "");
    const rn = normCardNumForCompare(resultNum);
    const in_ = normCardNumForCompare(itemNum);
    if (resultNum && itemNum) {
      if (rn && in_ && rn === in_) {
        score += 300;
        scoreLog.push("exactNum+300");
      } else if (resultNum.split("/")[0] === itemNum.split("/")[0]) {
        score += 80;
        scoreLog.push("prefixNum+80");
      } else {
        score -= 50;
        scoreLog.push("wrongNum-50");
      }

      const itemDenom = itemNum.includes("/") ? itemNum.split("/")[1] : null;
      const resultDenom = resultNum.includes("/") ? resultNum.split("/")[1] : null;
      if (itemDenom && resultDenom) {
        const d1 = normCardNumForCompare(itemDenom);
        const d2 = normCardNumForCompare(resultDenom);
        if (d1 && d2 && d1 === d2) {
          score += 200;
          scoreLog.push("denomMatch+200");
        } else {
          score -= 100;
          scoreLog.push("denomMiss-100");
        }
      }
    }
    if (itemNum && !resultNum) {
      score -= 50;
      scoreLog.push("noNum-50");
    }

    const rar = (r.rarity || "").toLowerCase();
    if (PREMIUM_ILLUSTRATION_RARITY_RE.test(rar)) {
      score += 90;
      scoreLog.push("premiumIllustration+90");
    }
    const itemRar = (item.rarity || "").toLowerCase();
    if (
      itemRar &&
      PREMIUM_ILLUSTRATION_RARITY_RE.test(itemRar) &&
      PREMIUM_ILLUSTRATION_RARITY_RE.test(rar)
    ) {
      score += 50;
      scoreLog.push("itemRarityAlign+50");
    }
    if (itemNum && itemNum.includes("/")) {
      const parts = itemNum.split("/");
      const a = parseInt(parts[0].trim(), 10);
      const b = parseInt(parts[1].trim(), 10);
      if (Number.isFinite(a) && Number.isFinite(b) && a > b) {
        if (PREMIUM_ILLUSTRATION_RARITY_RE.test(rar)) {
          score += 72;
          scoreLog.push("secretSlotPremium+72");
        } else if (/\b(common|uncommon)\b/i.test(rar)) {
          score -= 55;
          scoreLog.push("bulkInSecretSlot-55");
        }
      }
    }

    scores.push({ r, score, scoreLog });
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }

  if (DEBUG_IMAGES) {
    scores
      .sort((a, b) => b.score - a.score)
      .forEach((s, i) => {
        const prefix = i === 0 ? "   BET" : "  RIP";
        console.log(
          prefix +
            " [" +
            s.score +
            "] " +
            s.r.name +
            " | " +
            (s.r.expansion?.name || "?") +
            " #" +
            (s.r.number || "?") +
            " | lang:" +
            resultLanguage(s.r) +
            " | id:" +
            (s.r.id || "").slice(0, 12) +
            "... | " +
            s.scoreLog.join(", ")
        );
      });
  }

  return best;
}

async function resolveCardId(item, key) {
  try {
    const stored = await AsyncStorage.getItem(key);
    if (stored) {
      idMemCache[key] = stored;
      return stored;
    }
  } catch {}

  if (getScrydexApiState().paused) return null;

  return enqueueImageTask(async () => {
    if (getScrydexApiState().paused) return null;
    const setList = await getSetListCached();
    const itemLang = detectItemLanguage(item);

    // Normal Name
    let cleanName = (item.name || "").replace(/\s*\([^)]*\)\s*/g, "").trim();
    const hasNonLatin = /[^ -ɏ\s\d]/.test(cleanName);
    if (hasNonLatin) cleanName = cleanName.replace(/[^ -ɏ\s\d]/g, "").trim();
    if (!cleanName) cleanName = (item.name || "").trim();

    const numFull = (item.number || "").trim();
    const numPrefix = numFull.split("/")[0].trim();
    const numNoZero = String(parseInt(numPrefix, 10) || 0);

    const nameOk = (r) => {
      if (!cleanName) return true;
      const first = cleanName.split(/\s+/)[0].toLowerCase();
      if (first.length < 3) return true;
      return (r?.name || "").toLowerCase().includes(first);
    };

    let results = [];

    const numForSetPick = vintageCardNumberVariants(item.set, numFull)[0] || numFull;
    const setId = findSetId(item.set, numForSetPick, setList, itemLang);
    if (setId && numPrefix) {
      let found = null;
      for (const numTry of vintageCardNumberVariants(item.set, numFull)) {
        const q = `${setId} ${numTry}`;
        if (DEBUG_IMAGES) console.log(`[CatalogImage] precise: "${q}" (${item.name})`);
        try {
          const r = await searchCards(q, 5);
          if (r.some(nameOk)) {
            found = r;
            break;
          }
        } catch {}
      }
      if (!found) {
        for (const num of [...new Set([numPrefix, numNoZero])]) {
          const q = `${setId} ${num}`;
          if (DEBUG_IMAGES) console.log(`[CatalogImage] precise: "${q}" (${item.name})`);
          try {
            const r = await searchCards(q, 5);
            if (r.some(nameOk)) {
              found = r;
              break;
            }
          } catch {}
        }
      }
      if (found) results = found;
    }

    if (!results.length && cleanName && numFull) {
      const wantsPremium =
        isPremiumIllustrationRarityText(item.rarity) || isSecretSlotCardNumber(numFull);
      let merged = [];
      for (const nv of vintageCardNumberVariants(item.set, numFull)) {
        const qs = wantsPremium
          ? [
              `${cleanName} ${nv} illustration rare`,
              `${cleanName} ${nv} special illustration rare`,
              `${cleanName} ${nv}`,
            ]
          : [`${cleanName} ${nv}`];
        for (const q of qs) {
          try {
            const r = await searchCards(q, 15);
            merged = mergeCatSearchById(merged, r || []);
          } catch {}
        }
        if (merged.some(nameOk)) {
          results = merged;
          break;
        }
        merged = [];
      }
      if (!results.length) {
        const qs = wantsPremium
          ? [
              `${cleanName} ${numFull} illustration rare`,
              `${cleanName} ${numFull} special illustration rare`,
              `${cleanName} ${numFull}`,
            ]
          : [`${cleanName} ${numFull}`];
        let acc = [];
        for (const q of qs) {
          try {
            const r = await searchCards(q, 15);
            acc = mergeCatSearchById(acc, r || []);
          } catch {}
        }
        if (acc.some(nameOk)) results = acc;
      }
    }

    if (!results.length && cleanName && numPrefix && item.set?.trim()) {
      const setQ = (item.set || "").replace(/[()]/g, " ").replace(/\s+/g, " ").trim();
      const wantsPremium =
        isPremiumIllustrationRarityText(item.rarity) || isSecretSlotCardNumber(numFull);
      let merged = [];
      for (const nv of vintageCardNumberVariants(item.set, numFull)) {
        const base = `${cleanName} ${setQ} ${nv}`.replace(/\s+/g, " ").trim();
        const qs = wantsPremium
          ? [`${base} illustration rare`, `${base} special illustration rare`, base]
          : [base];
        for (const q of qs) {
          if (DEBUG_IMAGES) console.log(`[CatalogImage] name+set+num: "${q}"`);
          try {
            const r = await searchCards(q, 20);
            merged = mergeCatSearchById(merged, r || []);
          } catch {}
        }
        if (merged.some(nameOk)) {
          results = merged;
          break;
        }
        merged = [];
      }
      if (!results.length) {
        const base = `${cleanName} ${setQ} ${numFull || numPrefix}`.replace(/\s+/g, " ").trim();
        const qs = wantsPremium
          ? [`${base} illustration rare`, `${base} special illustration rare`, base]
          : [base];
        let acc = [];
        for (const q of qs) {
          try {
            const r = await searchCards(q, 20);
            acc = mergeCatSearchById(acc, r || []);
          } catch {}
        }
        if (acc.some(nameOk)) results = acc;
      }
    }

    //name + prefix only
    if (!results.length && cleanName && numPrefix && numPrefix !== numFull) {
      const q = `${cleanName} ${numPrefix}`;
      if (DEBUG_IMAGES) console.log(`[CatalogImage] name+prefix: "${q}"`);
      const r = await searchCards(q, 15);
      if (r.some(nameOk)) results = r;
    }

    //name only
    if (!results.length && cleanName) {
      if (DEBUG_IMAGES) console.log(`[CatalogImage] name only: "${cleanName}"`);
      results = await searchCards(cleanName, 15);
    }

    const best = await pickBest(results, item);
    if (best?.id) {
      idMemCache[key] = best.id;
      AsyncStorage.setItem(key, best.id).catch(() => {});
      return best.id;
    }

    if (DEBUG_IMAGES) console.log("   ⚠️  No match found for: " + item.name);
    return null;
  });
}

export function prewarmPage(items) {
  if (getScrydexApiState().paused) return;
  for (const item of items) {
    const key = cacheKey(item);
    if (!key || idMemCache[key] || item?.cardId) continue;
    resolveCardId(item, key).catch(() => {});
  }
}

export function getCachedCardId(item) {
  if (item?.cardId) return item.cardId;
  const key = cacheKey(item);
  return (key && idMemCache[key]) || null;
}

export async function ensureResolvedCardId(item) {
  if (!item?.name) return null;
  if (item.cardId) return item.cardId;
  const key = cacheKey(item);
  if (!key) return null;
  try {
    const stored = await AsyncStorage.getItem(key);
    if (stored) {
      idMemCache[key] = stored;
      return stored;
    }
  } catch {}
  if (idMemCache[key]) return idMemCache[key];
  return resolveCardId(item, key);
}

export default function CatalogImage({ item, size = "low", style, resizeMode = "cover" }) {
  const key = cacheKey(item);

  const hasDirectImage = !!item?.image;

  const initial = item?.cardId || (key && idMemCache[key]) || null;

  const [cardId, setCardId] = useState(initial);
  const [resolving, setResolving] = useState(!hasDirectImage && !initial && !!item?.name);
  const queued = useRef(false);

  useEffect(() => {
    if (isSealedCatalogRow(item) && !hasDirectImage) {
      setResolving(false);
      return;
    }
    if (hasDirectImage || !item?.name || cardId || !key || queued.current) {
      if (cardId) setResolving(false);
      return;
    }

    if (idMemCache[key]) {
      setCardId(idMemCache[key]);
      setResolving(false);
      return;
    }

    queued.current = true;
    let cancelled = false;

    resolveCardId(item, key)
      .then((id) => {
        if (cancelled) return;
        if (id) setCardId(id);
        setResolving(false);
      })
      .catch(() => {
        if (!cancelled) setResolving(false);
      });

    return () => {
      cancelled = true;
    };
  }, [item?.name, item?.number, item?.set, cardId, key, hasDirectImage]);

  if (hasDirectImage)
    return <Image source={{ uri: item.image }} style={style} resizeMode={resizeMode} />;

  if (resolving && !cardId) return <CardSkeleton style={style} />;
  if (cardId)
    return <PokeImage cardId={cardId} size={size} style={style} resizeMode={resizeMode} />;

  return (
    <View style={[s.ph, style]}>
      <Text style={s.phTxt}>{isSealedCatalogRow(item) ? "📦" : "🃏"}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  ph: { alignItems: "center", justifyContent: "center" },
  phTxt: { fontSize: 20, opacity: 0.2 },
});
