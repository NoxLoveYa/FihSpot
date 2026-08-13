// Persistent cache for scanned static-map tiles. Uses the Cache Storage API so
// it works from both the main thread and the scan Web Worker, survives across
// sessions and keeps repeat scans of an already-covered zone off the network.

const CACHE_NAME = 'fihspot-scan-tiles';
// ~350 KB per tile at 640@2x → 10 000 tiles ≈ 3.5 GB (user budget 5 GB).
const MAX_ENTRIES = 10000;
const TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
const TS_HEADER = 'x-fihspot-cached-at';

export interface CachedEntry {
  response: Response;
  /** true when the response came from the cache rather than the network. */
  cached: boolean;
}

async function openCache(): Promise<Cache | null> {
  try {
    if (typeof caches === 'undefined') return null;
    return await caches.open(CACHE_NAME);
  } catch {
    return null;
  }
}

/** Returns the cached response for `url` if it exists and is still fresh. */
export async function getCachedImage(url: string): Promise<CachedEntry | null> {
  const cache = await openCache();
  if (!cache) return null;
  try {
    const res = await cache.match(url);
    if (!res) return null;
    const ts = Number(res.headers.get(TS_HEADER) || 0);
    if (Date.now() - ts > TTL_MS) {
      await cache.delete(url).catch(() => {});
      return null;
    }
    return { response: res, cached: true };
  } catch {
    return null;
  }
}

/**
 * Stores a response (pass a clone; the original stays usable) with its
 * timestamp, then evicts least-recently-used entries past the budget.
 */
export async function cacheImage(url: string, response: Response): Promise<void> {
  const cache = await openCache();
  if (!cache) return;
  try {
    const headers = new Headers(response.headers);
    headers.set(TS_HEADER, String(Date.now()));
    const stored = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
    await cache.put(url, stored);
    await evictLru(cache);
  } catch {
    // Caching is best-effort; a failure must never break a scan.
  }
}

async function evictLru(cache: Cache): Promise<void> {
  try {
    const keys = await cache.keys();
    if (keys.length <= MAX_ENTRIES) return;
    const entries = await Promise.all(
      keys.map(async (req) => ({
        url: req.url,
        ts: Number((await cache.match(req))?.headers.get(TS_HEADER) || 0),
      })),
    );
    entries.sort((a, b) => a.ts - b.ts);
    const excess = entries.length - MAX_ENTRIES;
    for (let i = 0; i < excess; i++) {
      await cache.delete(entries[i].url).catch(() => {});
    }
  } catch {
    // ignore
  }
}
