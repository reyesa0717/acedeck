// Scrydex API client: card search, price/image extraction, variant matching, and request
// caching. Also tracks API state (rate-limit pause + credit cap) and notifies subscribers.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getSetLanguageMap, getSetList } from "./setCache";

const BASE = "https://api.scrydex.com/pokemon/v1";

const _searchMem = new Map();
const _imageMem = new Map();

const TTL = {
  SEARCH: 30 * 60 * 1000,
  CARD: 24 * 60 * 60 * 1000,
  IMAGE: null,
};

const CACHE_VERSION = "v2";
const K = {
  SEARCH: `sd_${CACHE_VERSION}_search_`,
  CARD: `sd_${CACHE_VERSION}_card_`,
  IMAGE: `sd_${CACHE_VERSION}_img_`,
  HIST: `sd_${CACHE_VERSION}_hist_`,
  LISTINGS: `sd_${CACHE_VERSION}_listings_`,
  SETPRICE: `sd_${CACHE_VERSION}_setprices_`,
  SYNC: "sd_sync_time",
};

const ALL_PREFIXES = [K.SEARCH, K.CARD, K.IMAGE, K.HIST, K.LISTINGS, K.SETPRICE];
const LEGACY_PREFIXES = [
  "sd_search_",
  "sd_card_",
  "sd_img_",
  "sd_hist_",
  "sd_listings_",
  "sd_setprices_",
  "pw_search_",
  "pw_card_",
  "pw_img_",
  "pw_hist_",
  "pw_listings_",
  "pw_setprices_",
];

function getAPIKey() {
  return process.env.EXPO_PUBLIC_SCRYDEX_API_KEY || "";
}

function getTeamId() {
  return process.env.EXPO_PUBLIC_SCRYDEX_TEAM_ID || "";
}

function _authHeaders() {
  return {
    "X-Api-Key": getAPIKey(),
    "X-Team-ID": getTeamId(),
    "Content-Type": "application/json",
  };
}

export function imageHeaders() {
  return {};
}

export function cardImageUrl(cardId, size = "low") {
  if (!cardId) return null;
  const s = size === "high" ? "large" : size === "medium" ? "medium" : "small";
  return `https://images.scrydex.com/pokemon/${encodeURIComponent(cardId)}/${s}`;
}

export function extractCardImageUrl(card) {
  if (!card) return null;
  const front = (card.images || []).find((img) => img.type === "front") || card.images?.[0];
  if (front) {
    const url = front.large || front.medium || front.small;
    if (typeof url === "string" && url.startsWith("http")) return url;
  }
  if (card.id) return cardImageUrl(card.id, "low");
  return null;
}

const FETCH_TIMEOUT = 6000;
const STALE_MAX_AGE = 48 * 60 * 60 * 1000;

const CAP_PAUSE_MS = 5 * 60 * 1000;
const RATE_PAUSE_MS = 30 * 1000;
const _capListeners = new Set();
let _apiPausedUntil = 0;
let _apiPauseReason = "";
let _apiPauseMessage = "";

function _notifyCapState() {
  const state = getScrydexApiState();
  for (const l of _capListeners) {
    try {
      l(state);
    } catch {}
  }
}

function _pauseApi(ms, reason, message) {
  const until = Date.now() + ms;
  if (until > _apiPausedUntil || reason !== _apiPauseReason) {
    _apiPausedUntil = until;
    _apiPauseReason = reason;
    _apiPauseMessage = message || reason;
    _notifyCapState();
  }
}

function _clearApiPause() {
  if (!_apiPausedUntil) return;
  _apiPausedUntil = 0;
  _apiPauseReason = "";
  _apiPauseMessage = "";
  _notifyCapState();
}

export function getScrydexApiState() {
  const now = Date.now();
  const paused = now < _apiPausedUntil;
  return {
    paused,
    reason: paused ? _apiPauseReason : "",
    message: paused ? _apiPauseMessage : "",
    pausedUntil: paused ? _apiPausedUntil : 0,
    secondsLeft: paused ? Math.max(0, Math.ceil((_apiPausedUntil - now) / 1000)) : 0,
  };
}

export function subscribeScrydexApiState(listener) {
  if (typeof listener !== "function") return () => {};
  _capListeners.add(listener);
  try {
    listener(getScrydexApiState());
  } catch {}
  return () => {
    _capListeners.delete(listener);
  };
}

export function resetScrydexApiPause() {
  _clearApiPause();
}

async function apiFetch(url) {
  if (Date.now() < _apiPausedUntil) {
    const err = new Error(_apiPauseReason || "SCRYDEX_PAUSED");
    err.code = _apiPauseReason || "SCRYDEX_PAUSED";
    throw err;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(url, {
      headers: _authHeaders(),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.status === 401) {
      _pauseApi(
        CAP_PAUSE_MS,
        "INVALID_API_KEY",
        "Scrydex rejected the API key. Check EXPO_PUBLIC_SCRYDEX_API_KEY and team id."
      );
      const e = new Error("Invalid Scrydex API key.");
      e.code = "INVALID_API_KEY";
      throw e;
    }
    if (res.status === 429) {
      _pauseApi(RATE_PAUSE_MS, "RATE_LIMIT", "Scrydex rate limit hit. Pausing requests for 30s.");
      const e = new Error("Rate limit hit. Try again in a moment.");
      e.code = "RATE_LIMIT";
      throw e;
    }
    if (res.status === 403) {
      let body = null;
      try {
        body = await res.json();
      } catch {}
      const code = body?.error?.code || "";
      const msg = body?.error?.message || "Forbidden (403).";
      if (code === "CREDIT_CAP_HIT" || /credit/i.test(msg)) {
        _pauseApi(
          CAP_PAUSE_MS,
          "CREDIT_CAP_HIT",
          "Scrydex credit cap reached. Live prices and new card images are paused until your plan's cap resets."
        );
        const e = new Error("CREDIT_CAP_HIT");
        e.code = "CREDIT_CAP_HIT";
        throw e;
      }
      const e = new Error("Scrydex 403: " + msg);
      e.code = "FORBIDDEN";
      throw e;
    }
    if (!res.ok) {
      const e = new Error("Scrydex error " + res.status);
      e.code = "HTTP_" + res.status;
      throw e;
    }
    if (_apiPausedUntil) _clearApiPause();
    return res.json();
  } catch (err) {
    clearTimeout(timer);
    if (err.name === "AbortError") {
      const e = new Error("TIMEOUT");
      e.code = "TIMEOUT";
      throw e;
    }
    throw err;
  }
}

async function apiFetchWithFallback(url, cacheKey, ttl, options = {}) {
  const bypassCache = options.bypassCache === true;

  let storedEntry = null;
  try {
    const raw = await AsyncStorage.getItem(cacheKey);
    if (raw) storedEntry = JSON.parse(raw);
  } catch {}

  if (!bypassCache) {
    if (_searchMem.has(cacheKey)) {
      const { data, ts } = _searchMem.get(cacheKey);
      if (Date.now() - ts < ttl) return { data, fresh: true };
    }
    if (storedEntry && Date.now() - storedEntry.ts < ttl) {
      _searchMem.set(cacheKey, { data: storedEntry.data, ts: storedEntry.ts });
      return { data: storedEntry.data, fresh: false };
    }
  }

  try {
    const result = await apiFetch(url);
    const now = Date.now();
    _searchMem.set(cacheKey, { data: result, ts: now });
    AsyncStorage.setItem(cacheKey, JSON.stringify({ data: result, ts: now })).catch(() => {});
    return { data: result, fresh: true };
  } catch (err) {
    if (storedEntry && Date.now() - storedEntry.ts < STALE_MAX_AGE) {
      _searchMem.set(cacheKey, { data: storedEntry.data, ts: storedEntry.ts });
      return { data: storedEntry.data, fresh: false, stale: true };
    }
    throw err;
  }
}

function searchKey(query) {
  return K.SEARCH + query.toLowerCase().trim().replace(/\s+/g, "_");
}

export function normCardNumForCompare(s) {
  const t = (s || "").replace(/\s/g, "");
  if (!t) return "";
  if (t.includes("/")) {
    const [a, b] = t.split("/");
    const pa = (a || "").replace(/^0+/, "") || "0";
    const pb = (b || "").replace(/^0+/, "") || "0";
    return pa + "/" + pb;
  }
  if (/^\d+$/.test(t)) return String(parseInt(t, 10));
  return t.toLowerCase();
}

function _isWotcBase102(setName) {
  const t = (setName || "").trim();
  if (!/^base\s*set\b/i.test(t) || /\bbase\s*set\s*2\b/i.test(t)) return false;
  return (
    /(unlimited|shadowless|1st\s*ed|first\s*ed|\(unlimited|\(shadowless|\(1st)/i.test(t) ||
    /^base\s*set\s*$/i.test(t)
  );
}

function _isWotcBase130(setName) {
  return /^base\s*set\s*2\b/i.test((setName || "").trim());
}

export function vintageCardNumberVariants(setName, numberRaw) {
  const raw = String(numberRaw || "")
    .trim()
    .replace(/\s/g, "");
  if (!raw || raw.includes("/")) return raw ? [raw] : [];
  if (!/^\d{1,3}$/.test(raw)) return [raw];
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return [raw];
  if (_isWotcBase130(setName) && n <= 130) return [`${n}/130`, raw];
  if (_isWotcBase102(setName) && n <= 102) return [`${n}/102`, raw];
  return [raw];
}

export async function searchCards(query, limit = 20, opts = {}) {
  const q = query.trim();
  const key = searchKey(q);
  const bypassCache = opts.bypassCache === true;

  if (!bypassCache && _searchMem.has(key)) {
    const { data, ts } = _searchMem.get(key);
    if (Date.now() - ts < TTL.SEARCH) {
      const cached = data?.data?.cards || (Array.isArray(data?.data) ? data.data : null) || [];
      return cached;
    }
  }

  try {
    const url = `${BASE}/cards?q=${encodeURIComponent(q)}&pageSize=${limit}&include=prices`;
    const { data: response } = await apiFetchWithFallback(url, key, TTL.SEARCH, { bypassCache });
    return response?.data?.cards || (Array.isArray(response?.data) ? response.data : []);
  } catch {
    return [];
  }
}

export async function searchCardPrecise(setId, cardNumber) {
  if (!setId || !cardNumber) return [];
  const q = `expansion.id:${setId} number:${cardNumber}`;
  const key = searchKey(q);
  try {
    const url = `${BASE}/cards?q=${encodeURIComponent(q)}&pageSize=5&include=prices`;
    const { data: response } = await apiFetchWithFallback(url, key, TTL.SEARCH);
    return response?.data?.cards || (Array.isArray(response?.data) ? response.data : []);
  } catch {
    return [];
  }
}

export async function getCard(cardId, opts = {}) {
  const key = K.CARD + cardId;
  try {
    const { data: response } = await apiFetchWithFallback(
      `${BASE}/cards/${encodeURIComponent(cardId)}?include=prices`,
      key,
      TTL.CARD,
      { bypassCache: opts.bypassCache === true }
    );
    return response?.data || null;
  } catch {
    return null;
  }
}

const TCG_VARIANT_ORDER = [
  "firstEditionShadowlessHolofoil",
  "unlimitedShadowlessHolofoil",
  "firstEditionHolofoil",
  "unlimitedHolofoil",
  "firstEditionNormal",
  "unlimitedNormal",
  "reverseHolofoil",
  "holofoil",
  "normal",
];

function _rawNmUsdPrices(card) {
  const out = [];
  for (const variant of card?.variants || []) {
    for (const p of variant.prices || []) {
      if (p.type === "raw" && p.currency === "USD") {
        out.push({ ...p, variantName: variant.name });
      }
    }
  }
  return out;
}

export function sanitizeTcgHighForDisplay(market, mid, rawHigh) {
  const h = Number(rawHigh);
  const m = Number(market);
  const d = Number(mid);
  if (rawHigh == null || rawHigh === "") return rawHigh;
  if (!Number.isFinite(h)) return rawHigh;
  if (!Number.isFinite(m) || m <= 0) return rawHigh;
  if (h > m * 20 && h > 150) return null;
  if (Number.isFinite(d) && d > 0 && h > d * 7 && h > 200) return null;
  return rawHigh;
}

export function extractTCGPrices(card) {
  const allPrices = _rawNmUsdPrices(card);
  if (!allPrices.length) return null;

  const nmPrices = allPrices.filter((p) => p.condition === "NM");
  const pool = nmPrices.length ? nmPrices : allPrices;

  let best = pool[0];
  for (const name of TCG_VARIANT_ORDER) {
    const found = pool.find((p) => p.variantName === name);
    if (found) {
      best = found;
      break;
    }
  }

  const variants = pool.map((p) => ({
    variant: p.variantName || p.condition || "Normal",
    market: p.market ?? null,
    low: p.low ?? null,
    mid: null,
    high: null,
    trends: p.trends || null,
  }));

  return {
    variant: best.variantName || best.condition || "Normal",
    market: best.market ?? null,
    low: best.low ?? null,
    mid: null,
    high: null,
    trends: best.trends || null,
    variants,
    url: null,
    currency: "USD",
  };
}

export function extractCMPrices(_card) {
  return null;
}

const GRADED_COMPANY_ORDER = ["PSA", "CGC", "BGS", "TAG", "SGC"];

export function extractGradedPrices(card) {
  if (!card?.variants?.length) return [];
  const out = [];
  for (const variant of card.variants) {
    for (const p of variant.prices || []) {
      if (p.type !== "graded") continue;
      if (p.currency && p.currency !== "USD") continue;
      out.push({
        variant: variant.name || null,
        company: String(p.company || "").trim(),
        grade: p.grade != null ? String(p.grade) : "",
        market: p.market ?? null,
        low: p.low ?? null,
        mid: p.mid ?? null,
        high: p.high ?? null,
        currency: p.currency || "USD",
        trends: p.trends || null,
        isPerfect: !!p.is_perfect,
        isSigned: !!p.is_signed,
        isError: !!p.is_error,
      });
    }
  }
  const rank = (c) => {
    const i = GRADED_COMPANY_ORDER.indexOf(c);
    return i === -1 ? GRADED_COMPANY_ORDER.length : i;
  };
  out.sort((a, b) => {
    const r = rank(a.company) - rank(b.company);
    if (r !== 0) return r;
    const ga = parseFloat(a.grade) || 0;
    const gb = parseFloat(b.grade) || 0;
    if (gb !== ga) return gb - ga;
    return (Number(b.market) || 0) - (Number(a.market) || 0);
  });
  return out;
}

export function bestCardmarketTrend(_cm) {
  return 0;
}

export function signalsJapaneseLocale(card) {
  if (!card) return false;
  const code = (card.language_code || card.expansion?.language_code || "EN").toUpperCase();
  if (code === "JA") return true;
  if (/[ぁ-んゔ-ゟァ-ヿ]/.test(card.name || "")) return true;
  return false;
}

export function extractCardInfo(card) {
  if (!card) {
    return {
      id: null,
      name: "Unknown",
      setName: "",
      setId: "",
      number: "",
      rarity: "",
      hp: "",
      stage: "",
      cardType: "",
      language: "eng",
      isEnglish: true,
      hasTCG: false,
      hasCM: false,
    };
  }

  const code = (card.language_code || card.expansion?.language_code || "EN").toUpperCase();
  let language = "eng";
  if (code === "JA") language = "jap";
  else if (code !== "EN") language = "other";

  const hasTCG = (card.variants || []).some((v) =>
    (v.prices || []).some((p) => p.type === "raw" && p.currency === "USD" && p.market != null)
  );

  return {
    id: card.id || null,
    name: card.name || "Unknown",
    setName: card.expansion?.name || "",
    setId: card.expansion?.id || "",
    number: card.number || "",
    rarity: card.rarity || "",
    hp: card.hp || "",
    stage: card.subtypes?.[0] || "",
    cardType: card.supertype || "",
    language,
    isEnglish: language === "eng",
    hasTCG,
    hasCM: false,
  };
}

let _setLangMap = null;

async function ensureSetMap() {
  if (_setLangMap) return _setLangMap;
  try {
    _setLangMap = await getSetLanguageMap(getAPIKey());
  } catch {
    _setLangMap = {};
  }
  return _setLangMap;
}

const DEBUG_MATCH = false;

function isNonEnglish(result) {
  const code = (result?.language_code || result?.expansion?.language_code || "EN").toUpperCase();
  return code !== "EN";
}

const STOP_WORDS = new Set(["set", "the", "and", "for", "with", "from", "pokemon", "cards"]);

export const PREMIUM_ILLUSTRATION_RARITY_RE =
  /illustration\s*rare|special\s*illustr|hyper\s*rare|secret\s*rare|rainbow\s*rare|special\s*art|amazing\s*rare|radiant\s*rare|ace\s*spec/i;

export function isSecretSlotCardNumber(num) {
  const raw = String(num || "")
    .trim()
    .replace(/\s/g, "");
  const parts = raw.split("/");
  if (parts.length !== 2) return false;
  const a = parseInt(parts[0], 10);
  const b = parseInt(parts[1], 10);
  return Number.isFinite(a) && Number.isFinite(b) && a > b;
}

export function isPremiumIllustrationRarityText(s) {
  return PREMIUM_ILLUSTRATION_RARITY_RE.test(String(s || "").toLowerCase());
}

function _mergePwSearchById(existing, more) {
  const ex = Array.isArray(existing) ? existing : existing ? [existing] : [];
  const seen = new Set(ex.map((r) => r?.id).filter(Boolean));
  const out = [...ex];
  for (const r of more || []) {
    if (r?.id && !seen.has(r.id)) {
      seen.add(r.id);
      out.push(r);
    }
  }
  return out;
}

export function catalogTcgAffinityBonus(catalogHint, r) {
  if (!catalogHint || !r) return 0;
  const hint = (
    (catalogHint.set || "") +
    " " +
    (catalogHint.variance || "") +
    " " +
    (catalogHint.rarity || "")
  ).toLowerCase();

  const variantNames = (r.variants || []).map((v) => (v.name || "").toLowerCase()).join(" | ");
  if (!variantNames) return 0;

  let b = 0;
  if (/\bunlimited\b/.test(hint) && /unlimited/.test(variantNames)) b += 110;
  if (/1st\s*ed|first\s*ed/.test(hint) && /firstedition/.test(variantNames)) b += 110;
  if (/shadowless/.test(hint) && /shadowless/.test(variantNames)) b += 110;
  if (
    (/\breverse/i.test(catalogHint.variance || "") || /reverse\s*holo/.test(hint)) &&
    /reverseholo/.test(variantNames)
  )
    b += 85;
  if (/holofoil|holo\s*rare/.test(hint) && /holofoil/.test(variantNames)) b += 55;
  if (
    (/\bnormal\b/i.test(catalogHint.variance || "") ||
      /\b(common|uncommon)\b/i.test(catalogHint.rarity || "")) &&
    !/holo\s*rare|holofoil/i.test(hint)
  ) {
    if (/normal/.test(variantNames)) b += 45;
  }
  if (PREMIUM_ILLUSTRATION_RARITY_RE.test(hint) && /holofoil/.test(variantNames)) b += 65;
  return b;
}

function _hasUsdPrices(r) {
  return (r?.variants || []).some((v) => (v.prices || []).some((p) => p.currency === "USD"));
}

async function pickBestResult(results, name, number, set, catalogHint = null) {
  if (!results?.length) return null;

  const english = results.filter((r) => !isNonEnglish(r));

  if (DEBUG_MATCH) {
    console.log("\n[MATCH] " + name + " #" + (number || "?") + " set:" + (set || "?"));
    console.log(
      "  " +
        results.length +
        " results -> " +
        (results.length - english.length) +
        " filtered -> " +
        english.length +
        " candidates"
    );
  }

  if (english.length === 0) {
    if (DEBUG_MATCH) console.log("  ⚠ All results non-English, retrying...");
    const results2 = await searchCards(name + (number ? " " + number : "") + " english", 10);
    const english2 = results2.filter((r) => !isNonEnglish(r));
    if (english2.length > 0) return pickFromPool(english2, name, number, set, catalogHint);
    return pickFromPool(results, name, number, set, catalogHint);
  }

  const pool = english;
  if (pool.length === 1) return pool[0];
  return pickFromPool(pool, name, number, set, catalogHint);
}

function pickFromPool(pool, name, number, set, catalogHint = null) {
  let best = pool[0];
  let bestScore = -999;
  const scored = [];

  const itemSet = (set || "").toLowerCase();
  const itemNum = (number || "").replace(/\s/g, "");
  const inputName = (name || "")
    .toLowerCase()
    .trim()
    .replace(/\s*\(.*?\)\s*/g, "")
    .replace(/\s+/g, " ");

  for (const r of pool) {
    let score = 0;
    const setName = (r.expansion?.name || "").toLowerCase();
    const reasons = [];

    if (inputName) {
      const resultName = (r.name || "").toLowerCase().trim();
      if (
        resultName === inputName ||
        resultName.startsWith(inputName + " ") ||
        resultName.startsWith(inputName + "-")
      ) {
        score += 500;
        reasons.push("exactName+500");
      } else if (resultName.includes(inputName) || inputName.includes(resultName.split(" ")[0])) {
        score += 150;
        reasons.push("partName+150");
      } else {
        score -= 400;
        reasons.push("nameMiss-400");
      }
    }

    if (_hasUsdPrices(r)) {
      score += 150;
      reasons.push("usd+150");
    }

    const aff = catalogTcgAffinityBonus(catalogHint, r);
    if (aff) {
      score += aff;
      reasons.push("tcgAff+" + aff);
    }

    if (itemSet) {
      const words = itemSet.split(/[\s\-:()]+/).filter((w) => w.length > 2 && !STOP_WORDS.has(w));
      for (const w of words) {
        if (setName.includes(w)) {
          score += 60;
          reasons.push("word[" + w + "]+60");
        } else {
          score -= 20;
          reasons.push("miss[" + w + "]-20");
        }
      }
      if (itemSet.length > 5 && setName.includes(itemSet)) {
        score += 200;
        reasons.push("fullset+200");
      }
      for (const d of itemSet.match(/\d+/g) || []) {
        if (d.length >= 2 && setName.includes(d)) {
          score += 40;
          reasons.push("digit[" + d + "]+40");
        }
      }
    }

    const resultNum = (r.number || "").replace(/\s/g, "");
    const rn = normCardNumForCompare(resultNum);
    const in_ = normCardNumForCompare(itemNum);
    if (resultNum && itemNum) {
      if (rn && in_ && rn === in_) {
        score += 300;
        reasons.push("exactNum+300");
      } else if (resultNum.split("/")[0] === itemNum.split("/")[0]) {
        score += 80;
        reasons.push("prefixNum+80");
      } else {
        score -= 50;
        reasons.push("wrongNum-50");
      }
    }
    if (itemNum && !resultNum) {
      score -= 50;
      reasons.push("noNum-50");
    }

    const rar = (r.rarity || "").toLowerCase();
    if (PREMIUM_ILLUSTRATION_RARITY_RE.test(rar)) {
      score += 90;
      reasons.push("premiumRarity+90");
    }
    const catRar = (catalogHint?.rarity || "").toLowerCase();
    if (
      catRar &&
      PREMIUM_ILLUSTRATION_RARITY_RE.test(catRar) &&
      PREMIUM_ILLUSTRATION_RARITY_RE.test(rar)
    ) {
      score += 50;
      reasons.push("catalogRarityAlign+50");
    }
    if (itemNum && itemNum.includes("/")) {
      const parts = itemNum.split("/");
      const a = parseInt(parts[0].trim(), 10);
      const b = parseInt(parts[1].trim(), 10);
      if (Number.isFinite(a) && Number.isFinite(b) && a > b) {
        if (PREMIUM_ILLUSTRATION_RARITY_RE.test(rar)) {
          score += 72;
          reasons.push("secretSlotPremium+72");
        } else if (/\b(common|uncommon)\b/i.test(rar)) {
          score -= 55;
          reasons.push("bulkInSecretSlot-55");
        }
      }
    }

    scored.push({ score, r, reasons });
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }

  if (DEBUG_MATCH) {
    scored
      .sort((a, b) => b.score - a.score)
      .forEach((s, i) => {
        const mark = i === 0 ? "WIN" : "   ";
        console.log(
          "  " +
            mark +
            " [" +
            s.score +
            "] " +
            s.r.name +
            " | " +
            s.r.expansion?.name +
            " #" +
            s.r.number +
            " | " +
            s.reasons.join(",")
        );
      });
  }

  return best;
}

function _detectLanguage(name, set) {
  const text = (set || "") + " " + (name || "");
  if (/[ぁ-ん゛-゜ァ-ン]/.test(text)) return "jap";
  if (/japanese|japan/i.test(text)) return "jap";
  if (/\bJP\b/.test(text)) return "jap";
  if (/[一-鿿㐀-䶿]/.test(text)) return "chn";
  if (/chinese|china|chn/i.test(text)) return "chn";
  return "eng";
}

function _normSetName(s) {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function setForSetIdMatch(s) {
  return (s || "").replace(/[()]/g, " ").replace(/\s+/g, " ").trim();
}

const _SET_STOP = new Set(["set", "the", "and", "for", "with", "from", "pokemon", "card", "cards"]);

function _findSetId(itemSet, itemNumber, setList, itemLang = "eng") {
  if (!itemSet || !setList?.length) return null;
  const normItem = _normSetName(itemSet);
  const itemWords = normItem.split(" ").filter((w) => w.length > 2 && !_SET_STOP.has(w));
  const denom = itemNumber?.includes("/") ? parseInt(itemNumber.split("/")[1], 10) : null;

  let bestId = null,
    bestScore = 0;
  for (const s of setList) {
    if (itemLang === "eng") {
      if (s.language && s.language !== "eng") continue;
    } else {
      if (s.language === "eng") continue;
    }
    const normName = _normSetName(s.name);
    const nameWords = normName.split(" ").filter((w) => w.length > 2 && !_SET_STOP.has(w));
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

function _nameMatch(results, cleanName) {
  if (!results?.length || !cleanName) return false;
  const first = cleanName.split(/\s+/)[0].toLowerCase();
  if (first.length < 3) return results.length > 0;
  return results.some((r) => (r?.name || "").toLowerCase().includes(first));
}

export async function fetchPricesForCard(name, number, set, catalogHint = null) {
  const cleanName = (name || "").replace(/\s*\([^)]*\)\s*/g, "").trim() || name || "";
  const cleanSet = (set || "").replace(/\s*\([^)]*\)\s*/g, "").trim();
  const itemLang = _detectLanguage(name, set);
  const numFull = (number || "").trim();
  const numPrefix = numFull.split("/")[0].trim();
  const numNoZero = String(parseInt(numPrefix, 10) || 0);

  let results = [];

  if (cleanName || numPrefix) {
    try {
      const setList = await getSetList(getAPIKey());
      const numForSetPick = vintageCardNumberVariants(set, numFull)[0] || numFull;
      const setId = _findSetId(setForSetIdMatch(set), numForSetPick, setList, itemLang);
      if (setId) {
        let got = null;
        for (const numTry of vintageCardNumberVariants(set, numFull)) {
          const r = await searchCardPrecise(setId, numTry);
          if (_nameMatch(r, cleanName)) {
            got = r;
            break;
          }
        }
        if (!got) {
          for (const num of [...new Set([numPrefix, numNoZero])]) {
            const r = await searchCardPrecise(setId, num);
            if (_nameMatch(r, cleanName)) {
              got = r;
              break;
            }
          }
        }
        if (got) results = got;
      }
    } catch {}
  }

  if (!results.length && cleanName && numFull) {
    let got = null;
    for (const nv of vintageCardNumberVariants(set, numFull)) {
      const r = await searchCards(`${cleanName} ${nv}`, 15);
      if (_nameMatch(r, cleanName)) {
        got = r;
        break;
      }
    }
    if (!got) {
      const r = await searchCards(`${cleanName} ${numFull}`, 15);
      if (_nameMatch(r, cleanName)) got = r;
    }
    if (got) results = got;
  }

  if (!results.length && cleanName && numPrefix && set) {
    const setQ = setForSetIdMatch(set);
    let got = null;
    for (const nv of vintageCardNumberVariants(set, numFull)) {
      const q = `${cleanName} ${setQ} ${nv}`.replace(/\s+/g, " ").trim();
      const r = await searchCards(q, 20);
      if (_nameMatch(r, cleanName)) {
        got = r;
        break;
      }
    }
    if (!got) {
      const q = `${cleanName} ${setQ} ${numFull || numPrefix}`.replace(/\s+/g, " ").trim();
      const r = await searchCards(q, 20);
      if (_nameMatch(r, cleanName)) got = r;
    }
    if (got) results = got;
  }

  if (!results.length && cleanName && numPrefix && numPrefix !== numFull) {
    const r = await searchCards(`${cleanName} ${numPrefix}`, 15);
    if (_nameMatch(r, cleanName)) results = r;
  }

  if (!results.length && cleanName) {
    results = await searchCards(cleanName, 15);
  }

  if (!results.length) return { tcg: null, cm: null, cardId: null };

  let pool = Array.isArray(results) ? results : [results];
  if (
    cleanName &&
    numFull &&
    (isSecretSlotCardNumber(numFull) || isPremiumIllustrationRarityText(catalogHint?.rarity || ""))
  ) {
    pool = _mergePwSearchById(
      pool,
      await searchCards(`${cleanName} ${numFull} illustration rare`, 18)
    );
    pool = _mergePwSearchById(
      pool,
      await searchCards(`${cleanName} ${numFull} special illustration rare`, 12)
    );
  }

  const card = await pickBestResult(pool, cleanName, number, set, catalogHint);
  if (!card) return { tcg: null, cm: null, cardId: null };
  return {
    tcg: extractTCGPrices(card),
    cm: null,
    cardId: card.id,
    info: extractCardInfo(card),
  };
}

export async function syncCatalogPrices(catalog, onProgress) {
  const BATCH = 5;
  const DELAY_MS = 1100;
  const total = catalog.length;
  let done = 0,
    synced = 0,
    skipped = 0,
    errors = 0;

  for (let i = 0; i < catalog.length; i += BATCH) {
    const batch = catalog.slice(i, i + BATCH);
    await Promise.allSettled(
      batch.map(async (item) => {
        try {
          const key = searchKey(item.number ? item.name + " " + item.number : item.name);
          if (_searchMem.has(key)) {
            skipped++;
            return;
          }
          const raw = await AsyncStorage.getItem(key);
          if (raw) {
            skipped++;
            return;
          }
          const q = item.number ? item.name + " " + item.number : item.name;
          await searchCards(q, 1);
          synced++;
        } catch {
          errors++;
        } finally {
          done++;
          if (onProgress) onProgress(done, total, item.name);
        }
      })
    );
    if (i + BATCH < catalog.length) {
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }

  await AsyncStorage.setItem(K.SYNC, new Date().toISOString());
  return { synced, skipped, errors, total };
}

export async function getLastSyncTime() {
  try {
    return await AsyncStorage.getItem(K.SYNC);
  } catch {
    return null;
  }
}

export async function clearScrydexCaches() {
  _searchMem.clear();
  _imageMem.clear();
  let removed = 0;
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const targets = allKeys.filter(
      (k) =>
        ALL_PREFIXES.some((p) => k.startsWith(p)) ||
        LEGACY_PREFIXES.some((p) => k.startsWith(p)) ||
        k === "sd_expansions_cache_v1"
    );
    if (targets.length) {
      await AsyncStorage.multiRemove(targets);
      removed = targets.length;
    }
  } catch {}
  return removed;
}

export async function fetchImageAsBase64(cardId, size = "high") {
  if (!cardId) return null;

  const scrydexSize = size === "high" ? "large" : "small";
  const shortKey = cardId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 24);
  const storeKey = K.IMAGE + shortKey + "_" + scrydexSize;

  if (_imageMem.has(storeKey)) return _imageMem.get(storeKey);

  try {
    const cached = await AsyncStorage.getItem(storeKey);
    if (cached) {
      _imageMem.set(storeKey, cached);
      return cached;
    }
  } catch {}

  try {
    const cardRaw = await AsyncStorage.getItem(K.CARD + cardId);
    if (cardRaw) {
      const stored = JSON.parse(cardRaw);
      const card = stored?.data?.data || stored?.data || null;
      const front = (card?.images || []).find((img) => img.type === "front") || card?.images?.[0];
      const url = front?.[scrydexSize] || front?.large || front?.small || null;
      if (url) {
        _imageMem.set(storeKey, url);
        AsyncStorage.setItem(storeKey, url).catch(() => {});
        return url;
      }
    }
  } catch {}

  const cdnUrl = `https://images.scrydex.com/pokemon/${encodeURIComponent(cardId)}/${scrydexSize}`;
  _imageMem.set(storeKey, cdnUrl);
  return cdnUrl;
}

export async function fetchPriceHistory(cardId) {
  if (!cardId) return null;
  const key = K.HIST + cardId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 24);
  try {
    const url = `${BASE}/cards/${encodeURIComponent(cardId)}/price_history?days=120&condition=NM&page_size=120`;
    const { data: response } = await apiFetchWithFallback(url, key, 6 * 60 * 60 * 1000);
    return response;
  } catch (err) {
    if (err.message?.includes("403")) return null;
    try {
      const raw = await AsyncStorage.getItem(key);
      if (raw) return JSON.parse(raw).data;
    } catch {}
    return null;
  }
}

function _historyPickMarket(entry, opts) {
  if (!entry?.prices) return null;
  const conditionFilter = opts?.condition ?? "NM";
  const variantFilter = opts?.variant ?? null;
  const matches = entry.prices.filter(
    (p) =>
      p.type === "raw" &&
      p.currency === "USD" &&
      (!conditionFilter || p.condition === conditionFilter) &&
      (!variantFilter || p.variant === variantFilter) &&
      p.market != null
  );
  if (!matches.length) return null;
  return (matches.find((p) => /holo/i.test(p.variant || "")) || matches[0]).market;
}

export function extractHistorySummary(history) {
  if (!history?.data?.length) return null;

  const entries = [...history.data].sort((a, b) => new Date(b.date) - new Date(a.date));

  function priceNDaysAgo(n) {
    const target = new Date();
    target.setDate(target.getDate() - n);
    const targetStr = target.toISOString().split("T")[0];
    const match = entries.find((e) => e.date <= targetStr);
    return match ? _historyPickMarket(match) : null;
  }

  const current = _historyPickMarket(entries[0]);
  if (current == null) return null;

  const price7d = priceNDaysAgo(7);
  const price14d = priceNDaysAgo(14);
  const price15d = priceNDaysAgo(15);
  const price30d = priceNDaysAgo(30);
  const price60d = priceNDaysAgo(60);
  const price120d = priceNDaysAgo(120);

  const pctChange = (now, then) =>
    now != null && then != null && then > 0 ? +(((now - then) / then) * 100).toFixed(2) : null;

  return {
    tcg: {
      current,
      price7d,
      price14d,
      price15d,
      price30d,
      price60d,
      price120d,
      change7d: pctChange(current, price7d),
      change15d: pctChange(current, price15d),
      change30d: pctChange(current, price30d),
      dollar7d: price7d != null ? +(current - price7d).toFixed(2) : null,
      dollar15d: price15d != null ? +(current - price15d).toFixed(2) : null,
      dollar30d: price30d != null ? +(current - price30d).toFixed(2) : null,
    },
    cm: null,
  };
}

export function extractHistorySeries(history, opts = {}) {
  if (!history?.data?.length) return [];
  const sorted = [...history.data].sort((a, b) => new Date(a.date) - new Date(b.date));
  const out = [];
  for (const e of sorted) {
    const m = _historyPickMarket(e, opts);
    if (m != null) out.push({ date: e.date, market: Number(m) });
  }
  return out;
}

export async function fetchListings(cardId, limit = 20) {
  if (!cardId) return [];
  const key = K.LISTINGS + cardId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 24);
  try {
    const url = `${BASE}/cards/${encodeURIComponent(cardId)}/listings?page_size=${limit}`;
    const { data: response } = await apiFetchWithFallback(url, key, 15 * 60 * 1000);
    return response?.data || [];
  } catch (err) {
    if (err.message?.includes("403") || err.message?.includes("404")) return [];
    try {
      const raw = await AsyncStorage.getItem(key);
      if (raw) return JSON.parse(raw).data?.data || [];
    } catch {}
    return [];
  }
}

export async function getSetCodeById(setId) {
  if (!setId) return null;
  try {
    const list = await getSetList(getAPIKey());
    const found = list.find((s) => s.set_id === String(setId));
    return found?.set_id || found?.set_code || null;
  } catch {
    return null;
  }
}

export async function fetchSetPrices(expansionId, _source = "both") {
  if (!expansionId) return null;
  const key = K.SETPRICE + expansionId;
  const PAGE_SIZE = 100;
  const MAX_PAGES = 6;
  try {
    const allCards = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const url = `${BASE}/cards?q=${encodeURIComponent("expansion.id:" + expansionId)}&page=${page}&pageSize=${PAGE_SIZE}&include=prices`;
      const pageKey = key + "_p" + page;
      const { data: response } = await apiFetchWithFallback(url, pageKey, 15 * 60 * 1000);
      const cards = response?.data?.cards || (Array.isArray(response?.data) ? response.data : []);
      if (!cards.length) break;
      allCards.push(...cards);
      const total = Number(response?.totalCount) || allCards.length;
      if (allCards.length >= total) break;
    }
    return { cards: allCards };
  } catch {
    try {
      const raw = await AsyncStorage.getItem(key);
      if (raw) return JSON.parse(raw).data;
    } catch {}
    return null;
  }
}

export function normalizeCardNumberKey(num) {
  if (num == null || num === "") return "";
  return String(num).replace(/\s/g, "");
}

export function buildSetPriceMap(setPricesData) {
  const map = new Map();
  const cards = setPricesData?.cards || [];
  if (!cards.length) return map;

  for (const card of cards) {
    const num = normalizeCardNumberKey(card.number);
    if (!num) continue;
    if (!map.has(num)) map.set(num, { tcg: null, cm: null });
    const entry = map.get(num);

    for (const variant of card.variants || []) {
      for (const p of variant.prices || []) {
        if (p.type === "raw" && p.currency === "USD") {
          const mkt = p.market || 0;
          if (!entry.tcg || mkt > (entry.tcg.market || 0)) {
            entry.tcg = {
              market: mkt,
              low: p.low ?? null,
              mid: null,
              high: null,
              variant: variant.name || null,
            };
          }
        }
      }
    }
  }
  return map;
}

export async function fetchSetStatistics(_setCode) {
  return null;
}

export async function fetchTrendingSets(_period = "7d", _limit = 10) {
  return [];
}

export async function fetchTopCards(_metric = "price", _source = "tcg", _limit = 20) {
  return [];
}

export function getRateLimitStatus() {
  return { hour: null, day: null };
}
