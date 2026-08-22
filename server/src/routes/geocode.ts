import { Router } from 'express';
import { ApiError } from '../middleware/errorHandler';
import { rateLimit } from 'express-rate-limit';

// Place search is proxied through OUR server so users' queries and IPs never
// reach the third-party service directly, and repeated queries are answered
// from an in-memory cache without touching it at all.
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

interface CachedResults {
  expiresAt: number;
  data: unknown;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;

const cache = new Map<string, CachedResults>();

function cacheGet(key: string): unknown | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() > hit.expiresAt) {
    cache.delete(key);
    return undefined;
  }
  // Refresh recency so eviction drops the least recently used entries.
  cache.delete(key);
  cache.set(key, hit);
  return hit.data;
}

function cacheSet(key: string, data: unknown) {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, data });
}

const geocodeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  message: { error: 'Too many requests, try again later', code: 'RATE_LIMITED' },
  standardHeaders: true,
  legacyHeaders: false,
});

const router = Router();

router.get('/', geocodeLimiter, async (req, res, next) => {
  try {
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const lang = typeof req.query.lang === 'string' && /^[a-z]{2}(-[A-Za-z]{2})?$/.test(req.query.lang)
      ? req.query.lang
      : 'en';

    if (query.length < 2 || query.length > 100) {
      throw new ApiError(400, 'Invalid search query', 'INVALID_QUERY');
    }

    const key = `${lang}:${query.toLowerCase()}`;
    const cached = cacheGet(key);
    if (cached) {
      res.json(cached);
      return;
    }

    const url =
      `${NOMINATIM_URL}?format=jsonv2&limit=5&accept-language=${encodeURIComponent(lang)}` +
      `&q=${encodeURIComponent(query)}`;
    const upstream = await fetch(url, {
      headers: { 'User-Agent': 'FihSpot/1.0 (https://fihspot.com)' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!upstream.ok) {
      throw new ApiError(502, 'Search service unavailable', 'SEARCH_SERVICE_ERROR');
    }

    const data = await upstream.json();
    cacheSet(key, data);
    res.json(data);
  } catch (e) {
    next(e);
  }
});

export default router;
