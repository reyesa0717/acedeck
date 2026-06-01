// Data layer: per-user catalog + transaction storage backed by AsyncStorage, with an in-memory
// cache/index and debounced writes to Supabase when cloud sync is enabled.
import AsyncStorage from "@react-native-async-storage/async-storage";

let _sb = null;
export function setSupabase(client) {
  _sb = client;
}

//  Active user

let _activeUserId = "local"; // "local" = no account, single user

export function setActiveUser(userId) {
  // If user changes, wipe in-memory cache so next load reads the right data
  if (userId !== _activeUserId) {
    _catalog = null;
    _catalogIndex = null;
    _transactions = null;
    _acquisitions = null;
  }
  _activeUserId = userId || "local";
}

export function getActiveUser() {
  return _activeUserId;
}

//  Scoped key builder

function K(type) {
  return `pos_${_activeUserId}_${type}`;
}

//  In-memory store
let _catalog = null;
let _catalogIndex = null;
let _transactions = null;
let _acquisitions = null;

function buildIndex(catalog) {
  const index = new Map();
  for (const card of catalog) index.set(String(card.id), card);
  return index;
}

//  CATALOG

export async function loadCatalog() {
  if (_catalog) return _catalog;
  try {
    const raw = await AsyncStorage.getItem(K("catalog"));
    _catalog = raw ? JSON.parse(raw) : [];
  } catch {
    _catalog = [];
  }
  _catalogIndex = buildIndex(_catalog);
  return _catalog;
}

export async function saveCatalog(catalog) {
  _catalog = catalog;
  _catalogIndex = buildIndex(catalog);
  await AsyncStorage.setItem(K("catalog"), JSON.stringify(catalog));
  _pushCatalogToCloud();
}

export async function clearCatalog() {
  _catalog = [];
  _catalogIndex = new Map();
  await AsyncStorage.removeItem(K("catalog"));
}

export function searchCatalog(query) {
  if (!_catalog) return [];
  if (!query?.trim()) return _catalog;
  const q = query.toLowerCase().trim();
  return _catalog.filter(
    (c) =>
      c.name?.toLowerCase().includes(q) ||
      c.number?.toLowerCase().includes(q) ||
      c.set?.toLowerCase().includes(q)
  );
}

export function getCatalogCard(id) {
  return _catalogIndex?.get(String(id)) || null;
}

export async function updateCardPrice(cardId, tcgPrice, cmPrice) {
  if (!_catalog || !_catalogIndex) return;
  const idx = _catalog.findIndex((c) => String(c.id) === String(cardId));
  if (idx === -1) return;
  _catalog[idx] = {
    ..._catalog[idx],
    cachedTCG: tcgPrice,
    cachedCM: cmPrice,
    priceCachedAt: Date.now(),
  };
  _catalogIndex.set(String(cardId), _catalog[idx]);
  clearTimeout(updateCardPrice._timer);
  updateCardPrice._timer = setTimeout(() => {
    AsyncStorage.setItem(K("catalog"), JSON.stringify(_catalog)).catch(() => {});
  }, 2000);
}
updateCardPrice._timer = null;

function _maxCachedTcgMarket(tcg) {
  if (!tcg) return 0;
  const vs = tcg.variants || [tcg];
  return vs.reduce(
    (mx, v) => {
      const x = Number(v?.market);
      return Number.isFinite(x) && x > mx ? x : mx;
    },
    Number(tcg.market) || 0
  );
}

function _bestCachedCmTrend(cm) {
  if (!cm) return 0;
  const vs = cm.variants || [cm];
  let mx = 0;
  for (const v of vs) {
    const t = Number(v?.trend);
    if (Number.isFinite(t) && t > mx) mx = t;
  }
  if (mx > 0) return mx;
  const r = Number(cm.trend);
  return Number.isFinite(r) ? r : 0;
}

function _cachedTcgImplausibleVsCm(card) {
  const tcgM = _maxCachedTcgMarket(card.cachedTCG);
  const cmT = _bestCachedCmTrend(card.cachedCM);
  return tcgM > 0 && cmT > 35 && tcgM < cmT / 25;
}

function _catalogPremiumRarity(card) {
  const r = (card.rarity || "").toLowerCase();
  return /illustration\s*rare|special\s*illustr|hyper\s*rare|secret\s*rare|rainbow\s*rare|special\s*art|amazing\s*rare|radiant\s*rare|ace\s*spec/i.test(
    r
  );
}

function _cachedTcgOutOfLineVsCatalogMarket(card) {
  const tcgMax = _maxCachedTcgMarket(card.cachedTCG);
  const csv = Number(card.marketPrice);
  if (!(tcgMax > 0) || !Number.isFinite(csv) || csv < 35) return false;
  if (!_catalogPremiumRarity(card)) return false;
  return csv / tcgMax >= 2.2 && tcgMax < csv * 0.55;
}

export function isPriceStale(card) {
  if (!card.priceCachedAt) return true;
  if (_cachedTcgImplausibleVsCm(card)) return true;
  if (_cachedTcgOutOfLineVsCatalogMarket(card)) return true;
  const price = card.cachedTCG?.market || card.cachedCM?.trend || 0;
  const ttl = price > 50 ? 2 * 3600000 : price > 10 ? 6 * 3600000 : 24 * 3600000;
  return Date.now() - card.priceCachedAt > ttl;
}

export async function addToCatalog(txn) {
  if (!_catalog) await loadCatalog();
  let idx = -1;
  if (txn.cardId) idx = _catalog.findIndex((c) => String(c.id) === String(txn.cardId));
  if (idx === -1 && txn.name && txn.number)
    idx = _catalog.findIndex(
      (c) => c.name?.toLowerCase() === txn.name?.toLowerCase() && c.number === txn.number
    );
  if (idx === -1 && txn.name)
    idx = _catalog.findIndex((c) => c.name?.toLowerCase() === txn.name?.toLowerCase());

  if (idx !== -1) {
    _catalog[idx] = { ..._catalog[idx], quantity: (_catalog[idx].quantity ?? 1) + 1 };
    _catalogIndex.set(String(_catalog[idx].id), _catalog[idx]);
  } else {
    const newCard = {
      id: txn.cardId || "acq_" + Date.now(),
      name: txn.name || "Unknown",
      set: txn.set || "",
      number: txn.number || "",
      rarity: txn.rarity || "",
      condition: txn.condition || "",
      marketPrice: txn.marketPrice || 0,
      buyPrice: txn.amount || 0,
      quantity: 1,
      source: "acquisition",
    };
    _catalog = [newCard, ..._catalog];
    _catalogIndex.set(String(newCard.id), newCard);
  }
  await AsyncStorage.setItem(K("catalog"), JSON.stringify(_catalog));
  _pushCatalogToCloud();
}

export async function deductFromCatalog(txn) {
  if (!_catalog) return;
  let idx = -1;
  if (txn.cardId) idx = _catalog.findIndex((c) => String(c.id) === String(txn.cardId));
  if (idx === -1 && txn.name && txn.number)
    idx = _catalog.findIndex(
      (c) => c.name?.toLowerCase() === txn.name?.toLowerCase() && c.number === txn.number
    );
  if (idx === -1 && txn.name)
    idx = _catalog.findIndex((c) => c.name?.toLowerCase() === txn.name?.toLowerCase());
  if (idx === -1) return;
  _catalog[idx] = { ..._catalog[idx], quantity: (_catalog[idx].quantity ?? 1) - 1 };
  _catalogIndex.set(String(_catalog[idx].id), _catalog[idx]);
  await AsyncStorage.setItem(K("catalog"), JSON.stringify(_catalog));
  _pushCatalogToCloud();
}

function _catalogIndexForTxn(txn) {
  if (!_catalog?.length) return -1;
  let idx = -1;
  if (txn.cardId) idx = _catalog.findIndex((c) => String(c.id) === String(txn.cardId));
  if (idx === -1 && txn.name && txn.number)
    idx = _catalog.findIndex(
      (c) => c.name?.toLowerCase() === txn.name?.toLowerCase() && c.number === txn.number
    );
  if (idx === -1 && txn.name)
    idx = _catalog.findIndex((c) => c.name?.toLowerCase() === txn.name?.toLowerCase());
  return idx;
}

export async function restoreCatalogAfterSale(txn) {
  if (!txn || txn.dir !== "out") return;
  if (!_catalog) await loadCatalog();
  const idx = _catalogIndexForTxn(txn);
  if (idx === -1) return;
  _catalog[idx] = { ..._catalog[idx], quantity: (_catalog[idx].quantity ?? 1) + 1 };
  _catalogIndex.set(String(_catalog[idx].id), _catalog[idx]);
  await AsyncStorage.setItem(K("catalog"), JSON.stringify(_catalog));
  _pushCatalogToCloud();
}

export async function reverseCatalogAfterAcquisition(txn) {
  if (!txn || txn.dir !== "in") return;
  if (!_catalog) await loadCatalog();
  const idx = _catalogIndexForTxn(txn);
  if (idx === -1) return;
  _catalog[idx] = { ..._catalog[idx], quantity: (_catalog[idx].quantity ?? 1) - 1 };
  _catalogIndex.set(String(_catalog[idx].id), _catalog[idx]);
  await AsyncStorage.setItem(K("catalog"), JSON.stringify(_catalog));
  _pushCatalogToCloud();
}

function _removeMatchingAcquisitionForTxn(txn) {
  if (!txn || txn.dir !== "in" || !_acquisitions?.length) return;
  const tTime = new Date(txn.time).getTime();
  const idx = _acquisitions.findIndex((a) => {
    const aTime = new Date(a.time).getTime();
    if (!Number.isFinite(aTime) || Math.abs(aTime - tTime) > 15000) return false;
    if (txn.cardId && a.cardId && String(txn.cardId) === String(a.cardId)) return true;
    if (
      txn.name &&
      a.name &&
      txn.name.toLowerCase() === a.name.toLowerCase() &&
      String(txn.number || "") === String(a.number || "")
    )
      return true;
    return false;
  });
  if (idx !== -1) _acquisitions.splice(idx, 1);
}

export async function getInventoryStatus() {
  const catalog = await loadCatalog();
  const inStock = [],
    empty = [],
    negative = [];
  for (const card of catalog) {
    const qty = card.quantity ?? 1;
    if (qty > 0) inStock.push(card);
    else if (qty === 0) empty.push(card);
    else negative.push(card);
  }
  return {
    inStock,
    empty,
    negative,
    total: catalog.length,
    totalInStock: inStock.reduce((s, c) => s + (c.quantity ?? 1), 0),
    totalValue: inStock.reduce((s, c) => s + (c.marketPrice || 0) * (c.quantity ?? 1), 0),
  };
}

//  TRANSACTIONS

export async function loadTransactions() {
  if (_transactions) return _transactions;
  try {
    const raw = await AsyncStorage.getItem(K("transactions"));
    _transactions = raw ? JSON.parse(raw) : [];
  } catch {
    _transactions = [];
  }
  return _transactions;
}

export async function saveTransaction(txn) {
  await loadTransactions();
  const newTxn = { ...txn, id: Date.now().toString(), time: new Date().toISOString() };
  _transactions = [newTxn, ..._transactions];
  await AsyncStorage.setItem(K("transactions"), JSON.stringify(_transactions));
  _pushTransactionToCloud(newTxn);
  return _transactions;
}

export async function deleteTransaction(id) {
  await loadTransactions();
  const removed = _transactions.find((t) => t.id === id);
  _transactions = _transactions.filter((t) => t.id !== id);
  try {
    await AsyncStorage.setItem(K("transactions"), JSON.stringify(_transactions));
  } catch (e) {
    if (e?.message?.includes("full") || e?.code === 13) {
      await clearImageCacheFromAsyncStorage();
      await AsyncStorage.setItem(K("transactions"), JSON.stringify(_transactions));
    } else {
      throw e;
    }
  }
  if (removed) {
    const invOk = removed.inventoryAdjusted !== false; // legacy rows = treat as adjusted
    if (removed.dir === "out") {
      if (invOk) await restoreCatalogAfterSale(removed);
    } else if (removed.dir === "in") {
      if (invOk) await reverseCatalogAfterAcquisition(removed);
      await loadAcquisitions();
      _removeMatchingAcquisitionForTxn(removed);
      try {
        await AsyncStorage.setItem(K("acquisitions"), JSON.stringify(_acquisitions));
      } catch (e2) {
        if (e2?.message?.includes("full") || e2?.code === 13) {
          await clearImageCacheFromAsyncStorage();
          await AsyncStorage.setItem(K("acquisitions"), JSON.stringify(_acquisitions));
        }
      }
    }
  }
  return _transactions;
}

//  ACQUISITIONS

export async function loadAcquisitions() {
  if (_acquisitions) return _acquisitions;
  try {
    const raw = await AsyncStorage.getItem(K("acquisitions"));
    _acquisitions = raw ? JSON.parse(raw) : [];
  } catch {
    _acquisitions = [];
  }
  return _acquisitions;
}

export async function saveAcquisition(acq) {
  await loadAcquisitions();
  const newAcq = { ...acq, id: Date.now().toString(), time: new Date().toISOString() };
  _acquisitions = [newAcq, ..._acquisitions];
  await AsyncStorage.setItem(K("acquisitions"), JSON.stringify(_acquisitions));
  _pushAcquisitionToCloud(newAcq);
  return _acquisitions;
}

//  STATS

export function calcStats(transactions) {
  const sold = transactions.filter((t) => t.dir === "out");
  const bought = transactions.filter((t) => t.dir === "in");
  const cashOut = sold.filter((t) => t.pay !== "TR");
  const cashIn = bought.filter((t) => t.pay !== "TR");
  const tradeTxns = transactions.filter((t) => t.pay === "TR");
  return {
    soldCount: sold.length,
    boughtCount: bought.length,
    tradeCount: tradeTxns.length,
    revenue: cashOut.reduce((s, t) => s + (t.amount || 0), 0),
    spent: cashIn.reduce((s, t) => s + (t.amount || 0), 0),
    net:
      cashOut.reduce((s, t) => s + (t.amount || 0), 0) -
      cashIn.reduce((s, t) => s + (t.amount || 0), 0),
    txCount: transactions.length,
  };
}

//  IMAGE CACHE CLEANUP
// Clear legacy AsyncStorage image blobs (now stored on the file system)
export async function clearImageCacheFromAsyncStorage() {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const bad = keys.filter(
      (k) =>
        k.startsWith("sd_img_") ||
        k.startsWith("sd_search_") ||
        k.startsWith("sd_card_") ||
        k.startsWith("pw_img_") ||
        k.startsWith("pw_search_") ||
        k.startsWith("pw_card_")
    );
    if (bad.length) await AsyncStorage.multiRemove(bad);
  } catch {}
}

//  LIST ALL USER IDs that have data on this device
export async function listLocalUserIds() {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const ids = new Set();
    for (const k of keys) {
      const m = k.match(/^pos_(.+)_catalog$/);
      if (m) ids.add(m[1]);
    }
    return [...ids];
  } catch {
    return [];
  }
}

//  CLOUD SYNC
function _cloudReady() {
  return _sb && _activeUserId && _activeUserId !== "local";
}

function _pushCatalogToCloud() {
  if (!_cloudReady() || !_catalog) return;
  const rows = _catalog.map((c) => ({
    user_id: _activeUserId,
    local_id: String(c.id),
    name: c.name || "Unknown",
    set_name: c.set || "",
    card_number: c.number || "",
    rarity: c.rarity || "",
    quantity: c.quantity ?? 1,
    market_price: c.marketPrice || null,
    condition: c.condition || null,
    language: c.language || "eng",
    card_id: c.cardId || null,
    synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));
  (async () => {
    try {
      // Upsert in chunks of 100
      for (let i = 0; i < rows.length; i += 100) {
        await _sb.from("catalog").upsert(rows.slice(i, i + 100), {
          onConflict: "user_id,local_id",
        });
      }
    } catch (e) {
      console.warn("[storage] catalog push failed:", e.message);
    }
  })();
}

function _pushTransactionToCloud(txn) {
  if (!_cloudReady()) return;
  _sb
    .from("transactions")
    .insert({
      user_id: _activeUserId,
      card_name: txn.name || null,
      card_number: txn.number || null,
      set_name: txn.set || null,
      sale_price: txn.amount || null,
      condition: txn.condition || null,
      payment: txn.pay || null,
      sold_at: txn.time || new Date().toISOString(),
    })
    .then(() => {})
    .catch((e) => console.warn("[storage] txn push failed:", e.message));
}

function _pushAcquisitionToCloud(acq) {
  if (!_cloudReady()) return;
  _sb
    .from("acquisitions")
    .insert({
      user_id: _activeUserId,
      card_name: acq.name || null,
      card_number: acq.number || null,
      set_name: acq.set || null,
      cost_price: acq.amount || null,
      condition: acq.condition || null,
      source: acq.source || null,
      acquired_at: acq.time || new Date().toISOString(),
    })
    .then(() => {})
    .catch((e) => console.warn("[storage] acq push failed:", e.message));
}

export async function syncFromCloud() {
  if (!_cloudReady()) return { ok: false, error: "not signed in" };
  try {
    //  Catalog
    const { data: cloudCatalog, error: catErr } = await _sb
      .from("catalog")
      .select("*")
      .eq("user_id", _activeUserId)
      .order("updated_at", { ascending: false });

    if (!catErr && cloudCatalog?.length) {
      const mapped = cloudCatalog.map((r) => ({
        id: r.local_id || String(r.id),
        name: r.name,
        set: r.set_name || "",
        number: r.card_number || "",
        rarity: r.rarity || "",
        condition: r.condition || "",
        marketPrice: r.market_price || 0,
        quantity: r.quantity ?? 1,
        language: r.language || "eng",
        cardId: r.card_id || null,
      }));
      // Merge: keep local price cache for cards we already have
      const existing = _catalog ? buildIndex(_catalog) : new Map();
      const merged = mapped.map((c) => {
        const local = existing.get(String(c.id));
        return local
          ? {
              ...c,
              cachedTCG: local.cachedTCG,
              cachedCM: local.cachedCM,
              priceCachedAt: local.priceCachedAt,
            }
          : c;
      });
      _catalog = merged;
      _catalogIndex = buildIndex(merged);
      await AsyncStorage.setItem(K("catalog"), JSON.stringify(merged));
      console.log("[storage] synced", merged.length, "catalog cards from cloud");
    }

    //  Transactions
    const { data: cloudTxns, error: txnErr } = await _sb
      .from("transactions")
      .select("*")
      .eq("user_id", _activeUserId)
      .order("sold_at", { ascending: false })
      .limit(1000);

    if (!txnErr && cloudTxns?.length) {
      const mapped = cloudTxns.map((r) => ({
        id: String(r.id),
        time: r.sold_at,
        name: r.card_name,
        number: r.card_number,
        set: r.set_name,
        amount: r.sale_price,
        condition: r.condition,
        pay: r.payment,
        dir: "out",
      }));
      _transactions = mapped;
      await AsyncStorage.setItem(K("transactions"), JSON.stringify(mapped));
      console.log("[storage] synced", mapped.length, "transactions from cloud");
    }

    //  Acquisitions
    const { data: cloudAcqs, error: acqErr } = await _sb
      .from("acquisitions")
      .select("*")
      .eq("user_id", _activeUserId)
      .order("acquired_at", { ascending: false })
      .limit(1000);

    if (!acqErr && cloudAcqs?.length) {
      const mapped = cloudAcqs.map((r) => ({
        id: String(r.id),
        time: r.acquired_at,
        name: r.card_name,
        number: r.card_number,
        set: r.set_name,
        amount: r.cost_price,
        condition: r.condition,
        source: r.source,
        dir: "in",
      }));
      _acquisitions = mapped;
      await AsyncStorage.setItem(K("acquisitions"), JSON.stringify(mapped));
      console.log("[storage] synced", mapped.length, "acquisitions from cloud");
    }

    return { ok: true };
  } catch (e) {
    console.warn("[storage] syncFromCloud failed:", e.message);
    return { ok: false, error: e.message };
  }
}

//  WIPE all data for a specific user (sign out + clear)
export async function wipeUserData(userId) {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const userKeys = keys.filter((k) => k.startsWith(`pos_${userId}_`));
    if (userKeys.length) await AsyncStorage.multiRemove(userKeys);
  } catch {}
  // Clear memory if wiping active user
  if (userId === _activeUserId) {
    _catalog = null;
    _catalogIndex = null;
    _transactions = null;
    _acquisitions = null;
  }
}
