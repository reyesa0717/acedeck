// Tracks online/offline state and provides stale-while-revalidate caching plus a write queue
// that flushes queued mutations once the connection comes back (for show-floor WiFi drops).
import NetInfo from "@react-native-community/netinfo";
import AsyncStorage from "@react-native-async-storage/async-storage";

const SLOW_NETWORK_TIMEOUT_MS = 6000;

const STALE_CACHE_MAX_AGE = 48 * 60 * 60 * 1000;

const _writeQueue = [];
let _isOnline = true;

export function getIsOnline() {
  return _isOnline;
}

let _listener = null;
export function startNetworkMonitoring(onChange) {
  try {
    const NI = require("@react-native-community/netinfo").default;
    _listener = NI.addEventListener((state) => {
      const was = _isOnline;
      _isOnline = !!(state.isConnected && state.isInternetReachable !== false);
      if (!was && _isOnline) flushWriteQueue();
      onChange?.(_isOnline);
    });

    NI.fetch().then((state) => {
      _isOnline = !!(state.isConnected && state.isInternetReachable !== false);
      onChange?.(_isOnline);
    });
  } catch {
    _isOnline = true;
  }
}

export function stopNetworkMonitoring() {
  _listener?.();
  _listener = null;
}

export async function withOfflineFallback(cacheKey, fetcher, ttlMs = 30 * 60 * 1000) {
  const cached = await _readCache(cacheKey);

  if (!_isOnline) {
    if (cached) return cached.data;
    throw new Error("Offline and no cached data for: " + cacheKey);
  }

  try {
    const fresh = await Promise.race([
      fetcher(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), SLOW_NETWORK_TIMEOUT_MS)
      ),
    ]);

    await _writeCache(cacheKey, fresh);
    return fresh;
  } catch (err) {
    if (cached) {
      const age = Date.now() - cached.ts;
      if (age < STALE_CACHE_MAX_AGE) {
        return cached.data;
      }
    }
    throw err;
  }
}

async function _readCache(key) {
  try {
    const raw = await AsyncStorage.getItem("ofc_" + key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function _writeCache(key, data) {
  try {
    await AsyncStorage.setItem("ofc_" + key, JSON.stringify({ data, ts: Date.now() }));
  } catch {}
}

export function queueWrite(fn, description = "") {
  _writeQueue.push({ fn, description, ts: Date.now() });
}

async function flushWriteQueue() {
  if (!_writeQueue.length) return;
  const pending = [..._writeQueue];
  _writeQueue.length = 0;
  for (const item of pending) {
    try {
      await item.fn();
    } catch {
      _writeQueue.push(item);
    }
  }
}

export async function prefetchCatalogPrices(catalog, fetchFn, onProgress) {
  if (!_isOnline) return;
  const stale = catalog.filter(
    (c) => c.name && (!c.priceCachedAt || Date.now() - c.priceCachedAt > 2 * 60 * 60 * 1000)
  );
  for (let i = 0; i < stale.length; i++) {
    if (!_isOnline) break;
    try {
      await fetchFn(stale[i]);
    } catch {}
    onProgress?.(i + 1, stale.length);
    await new Promise((r) => setTimeout(r, 150));
  }
}
