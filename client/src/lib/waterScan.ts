import { staticMapForScan } from './googleMaps';
import type { LatLng } from './googleMaps';
import type { ChunkJob } from './waterWorker';
import { cacheImage, getCachedImage } from './scanCache';
import {
  analyzeWater,
  DARK_WATER,
  haversineKm,
  latLngToWorld,
  regionsToDetectedWater,
  selectWaterCandidates,
  worldToLatLng,
} from './waterAnalysis';
import type { DetectedWater, ScanSensitivity } from './waterAnalysis';

// Dark-theme water color as rendered by the interactive map (#68bfd9 = hsl(194,60,63)).
export const SCAN_WATER_COLOR = { hex: '#68bfd9', r: 104, g: 191, b: 217 };

export { haversineKm };
export { SCAN_SENSITIVITIES } from './waterAnalysis';
export type { DetectedWater, ScanSensitivity };

export const RADIUS_OPTIONS_KM: number[] = [5, 30, 50];
export const DEFAULT_RADIUS_KM = 5;

export interface ScanResult {
  candidates: DetectedWater[];
  /** Blob URL of a static map covering the scanned area (for the overlay). */
  previewUrl: string;
  /** Preview image dimensions (1280×1280 with scale=2). */
  width: number;
  height: number;
  /** Number of tiles that came from the persistent cache (no network). */
  cachedCount: number;
}

export interface ScanOptions {
  radiusKm?: number;
  onProgress?: (done: number, total: number) => void;
}

const CHUNK_SIZE = 640; // static map request size in px
const SCALE = 2; // static map scale → decoded pixels are CHUNK_SIZE * SCALE
const EARTH_CIRC_M = 40075016.686;
const OVERLAP = 0.15; // chunks overlap so ponds straddling a border are fully caught
const MAX_CANDIDATES = 60;

// Per-radius tile budget. A small radius is already precise at a moderate zoom
// and stays light; large radii cover far more ground and get a big budget so
// they are scanned at the finest zoom that fits. The first scan of a zone is
// heavy, but tiles are cached, so every later scan of the same zone is served
// from cache.
const RADIUS_CHUNK_BUDGETS: Record<number, number> = {
  5: 64,
  30: 144,
  50: 144,
};

// Minimum pond diameter (meters) that each sensitivity level should catch, per
// radius. Kept genuinely small so a scan finds real fishing ponds even at the
// default sensitivity; they still grow a little with the radius because a
// 20m puddle is meaningless inside a large region.
const RADIUS_POND_SIZES_M: Record<number, Record<ScanSensitivity, number>> = {
  5: { sensitive: 15, default: 40, strict: 120 },
  30: { sensitive: 50, default: 120, strict: 400 },
  50: { sensitive: 70, default: 180, strict: 600 },
};

// Synthetic cache keys. Tiles are keyed by radius so the images used for one
// radius are never reused by another (even if two radii share a zoom). These
// URLs are only cache keys — the network always uses the real static-map URL.
const CACHE_PREFIX = 'https://fihspot-scan.local';

function metersPerPx(lat: number, zoom: number): number {
  return (EARTH_CIRC_M * Math.cos((lat * Math.PI) / 180)) / (256 * 2 ** zoom);
}

interface TilePlan {
  key: string;
  center: LatLng;
  zoom: number;
}

/**
 * Tiles the region on a FIXED global grid (Web-Mercator world units). At zoom
 * Z a 640px static map covers exactly 640 world units, so cells spaced by
 * `CHUNK_SIZE·(1−OVERLAP)` units tile the world deterministically: the same
 * geographic zone always maps to the same tile key and the same static-map
 * URL, which is what makes the tile cache reusable across scans.
 */
function planTiles(center: LatLng, radiusKm: number, chunkZoom: number): TilePlan[] {
  const cosLat = Math.max(0.2, Math.cos((center.lat * Math.PI) / 180));
  const dLat = (radiusKm * 1000) / 111320;
  const dLng = (radiusKm * 1000) / (111320 * cosLat);
  const sw = latLngToWorld(center.lat - dLat, center.lng - dLng, chunkZoom);
  const ne = latLngToWorld(center.lat + dLat, center.lng + dLng, chunkZoom);

  const spacing = CHUNK_SIZE * (1 - OVERLAP); // world units between tile centers
  const gx0 = Math.floor(sw.x / spacing);
  const gx1 = Math.floor(ne.x / spacing);
  const gy0 = Math.floor(ne.y / spacing);
  const gy1 = Math.floor(sw.y / spacing);

  // Only keep tiles whose cell actually intersects the scanned circle (skips
  // the square's corners, cutting requests for no loss of coverage).
  const radiusM = radiusKm * 1000;
  const halfDiagM = (spacing * Math.SQRT2 * 0.5) * metersPerPx(center.lat, chunkZoom);

  const tiles: TilePlan[] = [];
  for (let gy = gy0; gy <= gy1; gy++) {
    for (let gx = gx0; gx <= gx1; gx++) {
      const c = worldToLatLng((gx + 0.5) * spacing, (gy + 0.5) * spacing, chunkZoom);
      c.lat = Math.min(85, Math.max(-85, c.lat));
      const dLatM = Math.abs(c.lat - center.lat) * 111320;
      const dLngM = Math.abs(c.lng - center.lng) * 111320 * cosLat;
      if (Math.hypot(dLatM, dLngM) > radiusM + halfDiagM) continue;
      tiles.push({ key: `${chunkZoom}:${gx}:${gy}`, center: c, zoom: chunkZoom });
    }
  }
  return tiles;
}

/**
 * The analysis zoom for a radius: the highest zoom whose actual planned tile
 * count fits within the chunk budget (measured on the grid, since grid
 * alignment can straddle an extra row/column). Every radius is chunked the
 * same way and analyzed at the best resolution a phone can afford — never tied
 * to the live map zoom.
 */
function chooseChunkZoom(center: LatLng, radiusKm: number): number {
  const budget = RADIUS_CHUNK_BUDGETS[radiusKm] ?? 64;
  for (let z = 19; z >= 10; z--) {
    if (planTiles(center, radiusKm, z).length <= budget) return z;
  }
  return 10;
}

/** Pixel thresholds from a minimum physical pond diameter at the chunk zoom. */
function pondThresholds(minDiameterM: number, mpp: number) {
  const rPx = minDiameterM / (2 * mpp); // pond radius in px
  return {
    minArea: Math.max(20, Math.round(Math.PI * rPx * rPx)),
    minSide: Math.max(3, Math.round(rPx)),
  };
}

/** Square bounds of side 2·radius centered on the search point. */
function regionBounds(center: LatLng, radiusKm: number) {
  const cosLat = Math.max(0.2, Math.cos((center.lat * Math.PI) / 180));
  const dLat = (radiusKm * 1000) / 111320;
  const dLng = (radiusKm * 1000) / (111320 * cosLat);
  return {
    swLat: center.lat - dLat,
    swLng: center.lng - dLng,
    neLat: center.lat + dLat,
    neLng: center.lng + dLng,
  };
}

/** Center/zoom that fits the region into a CHUNK_SIZE×CHUNK_SIZE square. */
function fitPreview(b: { swLat: number; swLng: number; neLat: number; neLng: number }) {
  const lat = (b.swLat + b.neLat) / 2;
  const lng = (b.swLng + b.neLng) / 2;
  const cosLat = Math.max(0.2, Math.cos((lat * Math.PI) / 180));
  const widthM = Math.abs(b.neLng - b.swLng) * 111320 * cosLat;
  const heightM = Math.abs(b.neLat - b.swLat) * 111320;
  const base = CHUNK_SIZE * (EARTH_CIRC_M / 256) * cosLat;
  const zW = widthM > 0 ? Math.log2(base / widthM) : 21;
  const zH = heightM > 0 ? Math.log2(base / heightM) : 21;
  const zoom = Math.min(21, Math.max(3, Math.floor(Math.min(zW, zH))));
  return { center: { lat, lng }, zoom };
}

async function fetchPreview(preview: { center: LatLng; zoom: number }, radiusKm: number) {
  const url = staticMapForScan(preview.center, preview.zoom, CHUNK_SIZE);
  if (!url) throw new Error('Map service unavailable');
  const cacheKey = `${CACHE_PREFIX}/preview/${radiusKm}/${preview.center.lat.toFixed(5)}/${preview.center.lng.toFixed(5)}/${preview.zoom}`;
  const hit = await getCachedImage(cacheKey);
  let blob: Blob;
  if (hit) {
    blob = await hit.response.blob();
  } else {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Map request failed (${res.status})`);
    await cacheImage(cacheKey, res.clone());
    blob = await res.blob();
  }
  return { previewUrl: URL.createObjectURL(blob), width: CHUNK_SIZE * SCALE, height: CHUNK_SIZE * SCALE };
}

function supportsWorkerPath(): boolean {
  return typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined';
}

/** Runs chunk jobs across a pool of workers, one image at a time per worker. */
async function runChunkJobs(
  jobs: ChunkJob[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ perChunk: DetectedWater[][]; cachedCount: number }> {
  const results: (DetectedWater[] | undefined)[] = new Array(jobs.length);
  if (jobs.length === 0) return { perChunk: [], cachedCount: 0 };
  const cores = typeof navigator !== 'undefined' && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 4;
  const poolSize = Math.max(1, Math.min(6, cores));
  let cachedCount = 0;

  await new Promise<void>((resolve) => {
    let next = 0;
    let done = 0;
    let settled = 0;
    const workers: Worker[] = [];

    const finish = () => {
      settled += 1;
      if (settled === workers.length) resolve();
    };

    for (let i = 0; i < poolSize; i++) {
      const worker = new Worker(new URL('./waterWorker', import.meta.url), { type: 'module' });
      workers.push(worker);
      worker.onmessage = (e: MessageEvent) => {
        const r = e.data as { id: number; candidates: DetectedWater[]; cached?: boolean };
        results[r.id] = r.candidates;
        if (r.cached) cachedCount += 1;
        done += 1;
        onProgress?.(done, jobs.length);
        if (next < jobs.length) {
          worker.postMessage(jobs[next++]);
        } else {
          worker.terminate();
          finish();
        }
      };
      worker.onerror = () => {
        done += 1;
        onProgress?.(done, jobs.length);
        worker.terminate();
        finish();
      };
    }

    // Assign one job to each worker; spare workers are closed immediately so
    // the pool settles even when there are fewer jobs than workers.
    for (let i = 0; i < poolSize; i++) {
      if (next < jobs.length) {
        workers[i].postMessage(jobs[next++]);
      } else {
        workers[i].terminate();
        finish();
      }
    }
  });

  return { perChunk: results.map((r) => r ?? []), cachedCount };
}

/** Fallback when Web Workers / OffscreenCanvas are unavailable: sequential on the main thread. */
async function analyzeChunkOnMain(job: ChunkJob): Promise<{ candidates: DetectedWater[]; cached: boolean }> {
  const hit = await getCachedImage(job.cacheKey);
  let response: Response;
  let cached = false;
  if (hit) {
    response = hit.response;
    cached = true;
  } else {
    const res = await fetch(job.url);
    if (!res.ok) throw new Error(`Map request failed (${res.status})`);
    await cacheImage(job.cacheKey, res.clone());
    response = res;
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Could not decode the map image'));
    };
    img.src = objectUrl;
  });

  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  URL.revokeObjectURL(objectUrl);
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.drawImage(image, 0, 0);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);

  const { regions } = analyzeWater(img.data, img.width, img.height, [DARK_WATER], 0, job.minArea, job.minSide, {
    blueDominance: false,
  });
  const chosen = selectWaterCandidates(regions, img.width, img.height);
  return {
    candidates: regionsToDetectedWater(chosen, img.width, img.height, job.center, job.zoom, job.size),
    cached,
  };
}

/** Dedupes candidates detected in overlapping chunks (same pond twice). */
function mergeCandidates(perChunk: DetectedWater[][], dedupeKm: number): DetectedWater[] {
  const all = perChunk.flat().sort((a, b) => b.areaPx - a.areaPx);
  const kept: DetectedWater[] = [];
  for (const c of all) {
    if (kept.some((k) => haversineKm(k, c) < dedupeKm)) continue;
    kept.push(c);
    if (kept.length >= MAX_CANDIDATES) break;
  }
  return kept;
}

/**
 * Scans a circular area of `radiusKm` around the search center. The area is
 * chunked into a grid, each chunk fetched as a static map at the analysis zoom
 * and analyzed in parallel off the main thread, then the detections are merged
 * and clipped to the circle. The analysis zoom and the small/medium/large pond
 * sizes are chosen per radius so every option is chunked the same way and ends
 * up at a comparable, meaningful resolution — never tied to the live map zoom.
 */
export async function scanForWater(
  area: { lat: number; lng: number },
  sensitivity: ScanSensitivity = 'default',
  opts?: ScanOptions,
): Promise<ScanResult> {
  const radiusKm = opts?.radiusKm ?? DEFAULT_RADIUS_KM;

  const chunkZoom = chooseChunkZoom(area, radiusKm);
  const tiles = planTiles(area, radiusKm, chunkZoom);
  const mpp = metersPerPx(area.lat, chunkZoom);
  const minDiameterM = RADIUS_POND_SIZES_M[radiusKm]?.[sensitivity] ?? RADIUS_POND_SIZES_M[DEFAULT_RADIUS_KM]?.default ?? 250;
  const { minArea, minSide } = pondThresholds(minDiameterM, mpp);

  const bounds = regionBounds(area, radiusKm);
  const preview = fitPreview(bounds);
  const previewPromise = fetchPreview(preview, radiusKm);

  const jobs: ChunkJob[] = tiles.map((tile, id) => {
    const url = staticMapForScan(tile.center, tile.zoom, CHUNK_SIZE);
    if (!url) throw new Error('Map service unavailable');
    // The cache key is scoped to the radius so tiles never cross radii.
    const cacheKey = `${CACHE_PREFIX}/tile/${radiusKm}/${tile.key}`;
    return { id, url, cacheKey, center: tile.center, zoom: tile.zoom, size: CHUNK_SIZE, minArea, minSide };
  });

  let perChunk: DetectedWater[][];
  let cachedCount: number;
  if (supportsWorkerPath()) {
    const res = await runChunkJobs(jobs, opts?.onProgress);
    perChunk = res.perChunk;
    cachedCount = res.cachedCount;
  } else {
    perChunk = [];
    cachedCount = 0;
    for (let i = 0; i < jobs.length; i++) {
      try {
        const r = await analyzeChunkOnMain(jobs[i]);
        perChunk.push(r.candidates);
        if (r.cached) cachedCount += 1;
      } catch {
        perChunk.push([]);
      }
      opts?.onProgress?.(i + 1, jobs.length);
    }
  }

  const { previewUrl, width, height } = await previewPromise;

  // The dedupe distance must follow the analysis zoom: at a low zoom (huge
  // radius) one chunk pixel covers hundreds of meters, so chunk duplicates are
  // further apart than at a high zoom.
  const dedupeKm = Math.max(0.02, (4 * mpp) / 1000);

  // Clip to the circular radius, then place each candidate on the overview
  // preview so the dots overlay correctly even though they were found on the
  // zoomed-in chunks.
  const worldCenter = latLngToWorld(preview.center.lat, preview.center.lng, preview.zoom);
  const worldPerImagePx = CHUNK_SIZE / width;
  const candidates = mergeCandidates(perChunk, dedupeKm)
    .filter((c) => haversineKm(c, area) <= radiusKm)
    .map((c) => {
      const p = latLngToWorld(c.lat, c.lng, preview.zoom);
      return {
        ...c,
        px: (p.x - worldCenter.x) / worldPerImagePx + width / 2,
        py: (p.y - worldCenter.y) / worldPerImagePx + height / 2,
      };
    });

  return { candidates, previewUrl, width, height, cachedCount };
}
