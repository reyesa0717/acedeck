// Caches the Scrydex expansion (set) list locally for 7 days so set name/language lookups
// don't burn an API call on every search.
import AsyncStorage from "@react-native-async-storage/async-storage";

const BASE = "https://api.scrydex.com/pokemon/v1";
const STORAGE_KEY = "sd_expansions_cache_v2";
const TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

let _setLanguageMap = null;
let _setList = null;
let _loading = false;
let _loadPromise = null;

function _scrydexHeaders() {
  return {
    "X-Api-Key": process.env.EXPO_PUBLIC_SCRYDEX_API_KEY || "",
    "X-Team-ID": process.env.EXPO_PUBLIC_SCRYDEX_TEAM_ID || "",
  };
}

function _langCodeToSlug(code) {
  const c = (code || "EN").toUpperCase();
  if (c === "EN") return "eng";
  if (c === "JA") return "jap";
  if (c === "DE") return "ger";
  if (c === "FR") return "fre";
  if (c === "IT") return "ita";
  if (c === "ES") return "spa";
  if (c === "PT") return "por";
  if (c === "KO") return "kor";
  if (c === "ZH") return "chn";
  return "other";
}

async function _loadExpansions() {
  if (_setLanguageMap && _setList) return;
  if (_loading) {
    await _loadPromise;
    return;
  }
  _loading = true;

  _loadPromise = (async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const { langMap, list, ts } = JSON.parse(raw);
        if (Date.now() - ts < TTL && list?.length) {
          _setLanguageMap = langMap;
          _setList = list;
          _loading = false;
          return;
        }
      }
    } catch {}

    try {
      const res = await fetch(`${BASE}/expansions`, {
        headers: _scrydexHeaders(),
      });
      if (!res.ok) throw new Error("expansions fetch failed " + res.status);
      const json = await res.json();

      const expansions = Array.isArray(json?.data) ? json.data : [];

      const langMap = {};
      const list = [];
      for (const s of expansions) {
        if (!s.id) continue;
        const lang = _langCodeToSlug(s.language_code || s.language);
        langMap[s.id] = lang;
        list.push({
          set_id: s.id,
          name: s.name || "",
          set_code: s.code || s.id,
          card_count: s.total || s.printed_total || 0,
          language: lang,
        });
      }

      _setLanguageMap = langMap;
      _setList = list;
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ langMap, list, ts: Date.now() })).catch(
        () => {}
      );
    } catch {
      _setLanguageMap = _setLanguageMap || {};
      _setList = _setList || [];
    } finally {
      _loading = false;
    }
  })();

  return _loadPromise;
}

export async function getSetLanguageMap(_apiKey) {
  if (_setLanguageMap) return _setLanguageMap;
  await _loadExpansions();
  return _setLanguageMap || {};
}

export async function getSetList(_apiKey) {
  if (_setList) return _setList;
  await _loadExpansions();
  return _setList || [];
}

export async function clearSetCache() {
  _setLanguageMap = null;
  _setList = null;
  _loading = false;
  _loadPromise = null;
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {}
  try {
    await AsyncStorage.removeItem("sd_expansions_cache_v1");
  } catch {}
}

export function isNonEnglishSet(result, setLanguageMap) {
  const info = result?.card_info || {};
  const setId = String(result?.expansion?.id || info.set_id || result.set_id || "");
  if (!setId || !setLanguageMap) return false;
  const lang = setLanguageMap[setId];
  if (!lang) return false;
  if (lang === "eng") return false;
  return true;
}
