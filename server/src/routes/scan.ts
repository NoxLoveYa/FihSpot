import { Router, Response } from 'express';
import fsp from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { config } from '../config';
import { requireAuth, requireSearchAccess } from '../middleware/auth';
import { scanLimiter } from '../middleware/rateLimit';
import { ApiError } from '../middleware/errorHandler';

const router = Router();

// Scan tiles come from the Google Maps Static API, but they are proxied and
// cached on OUR server (keyed by the exact tile parameters, shared across all
// users) so repeat scans of a zone never touch Google again and nothing is
// stored in the client's Cache Storage.
const STATIC_MAP_BASE = 'https://maps.googleapis.com/maps/api/staticmap';
const WATER_STYLE = 'feature:water|element:geometry.fill|color:0x68bfd9';

// ~350 KB per tile at 640@2x → 8000 tiles ≈ 2.8 GB.
const MAX_FILES = 8000;
const EVICT_EVERY_WRITES = 40;

// Collisions: two clients scanning the same zone fetch the same tile exactly
// once; the second gets the buffered result while the first is in flight.
const inflight = new Map<string, Promise<Buffer>>();

let writesSinceEvict = 0;

async function ensureCacheDir(): Promise<string> {
  await fsp.mkdir(config.scanCacheDir, { recursive: true });
  return config.scanCacheDir;
}

/** Cache key: stable across clients regardless of URL ordering/precision. */
function tileKey(params: { lat: string; lng: string; zoom: number; size: number; scale: number }): string {
  return crypto
    .createHash('sha1')
    .update(`${params.lat},${params.lng},z${params.zoom},s${params.size}x${params.size},scale${params.scale}`)
    .digest('hex');
}

function buildStaticMapUrl(params: { lat: string; lng: string; zoom: number; size: number; scale: number }): string {
  const qs = [
    `center=${encodeURIComponent(`${params.lat},${params.lng}`)}`,
    `zoom=${params.zoom}`,
    `size=${params.size}x${params.size}`,
    `scale=${params.scale}`,
    `style=${encodeURIComponent(WATER_STYLE)}`,
    `key=${encodeURIComponent(config.googleMapsServerKey)}`,
  ].join('&');
  return `${STATIC_MAP_BASE}?${qs}`;
}

async function evictIfNeeded(): Promise<void> {
  if (++writesSinceEvict % EVICT_EVERY_WRITES !== 0) return;
  try {
    const dir = await ensureCacheDir();
    const entries = (await fsp.readdir(dir)).filter((f) => f.endsWith('.png'));
    if (entries.length <= MAX_FILES) return;
    const statted = await Promise.all(
      entries.map(async (name) => {
        try {
          const st = await fsp.stat(path.join(dir, name));
          return { name, mtime: st.mtimeMs };
        } catch {
          return null;
        }
      }),
    );
    statted
      .filter((e): e is { name: string; mtime: number } => e !== null)
      .sort((a, b) => a.mtime - b.mtime)
      .slice(0, entries.length - Math.floor(MAX_FILES * 0.9))
      .forEach((e) => {
        void fsp.unlink(path.join(dir, e.name)).catch(() => {});
      });
  } catch {
    // eviction is best-effort
  }
}

async function fetchFromGoogle(url: string): Promise<Buffer> {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) {
    throw new ApiError(502, `Map service returned ${res.status}`, 'MAP_SERVICE_ERROR');
  }
  return Buffer.from(await res.arrayBuffer());
}

async function serveTile(req: Record<string, unknown>, res: Response) {
  const nLat = Number(req.lat);
  const nLng = Number(req.lng);
  const nZoom = Number(req.zoom);
  const nSize = Number(req.size);
  const nScale = req.scale === undefined ? 2 : Number(req.scale);

  if (!Number.isFinite(nLat) || nLat < -90 || nLat > 90) throw new ApiError(400, 'Invalid latitude', 'INVALID_LAT');
  if (!Number.isFinite(nLng) || nLng < -180 || nLng > 180) throw new ApiError(400, 'Invalid longitude', 'INVALID_LNG');
  if (!Number.isInteger(nZoom) || nZoom < 1 || nZoom > 21) throw new ApiError(400, 'Invalid zoom', 'INVALID_ZOOM');
  if (!Number.isInteger(nSize) || nSize < 1 || nSize > 640) throw new ApiError(400, 'Invalid size', 'INVALID_SIZE');
  if (nScale !== 1 && nScale !== 2) throw new ApiError(400, 'Invalid scale', 'INVALID_SCALE');
  if (!config.googleMapsServerKey) {
    throw new ApiError(503, 'Map service is not configured', 'MAP_SERVICE_UNAVAILABLE');
  }

  const params = {
    lat: nLat.toFixed(6),
    lng: nLng.toFixed(6),
    zoom: nZoom,
    size: nSize,
    scale: nScale,
  };
  const key = tileKey(params);
  const dir = await ensureCacheDir();
  const filePath = path.join(dir, `${key}.png`);

  try {
    const cached = await fsp.readFile(filePath);
    res.set('X-Cache', 'HIT');
    res.type('png').set('Cache-Control', 'public, max-age=86400').send(cached);
    return;
  } catch {
    // cache miss → fetch below
  }

  const url = buildStaticMapUrl(params);
  const existing = inflight.get(key);
  if (existing) {
    const cachedBuffer = await existing;
    res.set('X-Cache', 'MISS');
    res.type('png').set('Cache-Control', 'public, max-age=86400').send(cachedBuffer);
    return;
  }

  const p = fetchFromGoogle(url).then(async (buf) => {
    await fsp.writeFile(filePath, buf);
    await evictIfNeeded();
    return buf;
  });
  inflight.set(key, p);
  try {
    const buffer = await p;
    res.set('X-Cache', 'MISS');
    res.type('png').set('Cache-Control', 'public, max-age=86400').send(buffer);
  } finally {
    inflight.delete(key);
  }
}

router.get('/tile', requireAuth, requireSearchAccess, scanLimiter, async (req, res, next) => {
  try {
    await serveTile(req.query, res);
  } catch (err) {
    next(err);
  }
});

export default router;
