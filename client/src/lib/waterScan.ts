import { staticMapForScan } from './googleMaps';
import type { LatLng } from './googleMaps';
import type { ChunkJob } from './waterWorker';
import {
  analyzeWater,
  DARK_WATER,
  haversineKm,
  latLngToWorld,
  regionsToDetectedWater,
  selectWaterCandidates,
} from './waterAnalysis';
import type { DetectedWater, ScanSensitivity } from './waterAnalysis';

// Dark-theme water color as rendered by the interactive map (#68bfd9 = hsl(194,60,63)).
export const SCAN_WATER_COLOR = { hex: '#68bfd9', r: 104, g: 191, b: 217 };

export { haversineKm };
export { SCAN_SENSITIVITIES } from './waterAnalysis';
export type { DetectedWater, ScanSensitivity };

export const RADIUS_OPTIONS_KM: number[] = [1, 5, 10, 30, 50, 100];
export const DEFAULT_RADIUS_KM = 10;

export interface ScanResult {
  candidates: DetectedWater[];
  /** Blob URL of a static map covering the scanned area (for the overlay). */
  previewUrl: string;
  /** Preview image dimensions (1280×1280 with scale=2). */
  width: number;
  height: number;
}

export interface ScanOptions {
  radiusKm?: number;
  onProgress?: (done: number, total: number) => void;
}

const CHUNK_SIZE = 640; // static map request size in px
const SCALE = 2; // static map scale → decoded pixels are CHUNK_SIZE * SCALE
const EARTH_CIRC_M = 40075016.686;
const MAX_CHUNKS = 36;
const OVERLAP = 0.15; // chunks overlap so ponds straddling a border are fully caught
const MAX_CANDIDATES = 60;

// Minimum pond diameter (meters) that each sensitivity level should catch, per
// radius. Kept genuinely small so a scan finds real fishing ponds even at the
// default sensitivity; they still grow a little with the radius because a
// 20m puddle is meaningless inside a 100km region.
const RADIUS_POND_SIZES_M: Record<number, Record<ScanSensitivity, number>> = {
  1: { sensitive: 8, default: 20, strict: 50 },
  5: { sensitive: 15, default: 40, strict: 120 },
  10: { sensitive: 25, default: 60, strict: 200 },
  30: { sensitive: 50, default: 120, strict: 400 },
  50: { sensitive: 70, default: 180, strict: 600 },
  100: { sensitive: 100, default: 250, strict: 800 },
};

function metersPerPx(lat: number, zoom: number): number {
  return (EARTH_CIRC_M * Math.cos((lat * Math.PI) / 180)) / (256 * 2 ** zoom);
}

/**
 * The analysis zoom for a radius: the highest zoom at which the whole radius
 * region fits within the chunk budget. The grid is then that many chunks per
 * axis, so every radius is chunked uniformly and each chunk is analyzed at the
 * best resolution a phone can afford — never tied to the live map zoom.
 */
function chooseChunkZoom(lat: number, radiusKm: number): number {
  const sideM = radiusKm * 2000;
  for (let z = 19; z >= 10; z--) {
    const stepM = CHUNK_SIZE * metersPerPx(lat, z) * (1 - OVERLAP);
    const cols = Math.ceil(sideM / stepM);
    if (cols * cols <= MAX_CHUNKS) return z;
  }
  return 10;
}

function planChunks(
  center: LatLng,
  radiusKm: number,
  chunkZoom: number,
): { center: LatLng; zoom: number }[] {
  const sideM = radiusKm * 2000;
  const cosLat = Math.max(0.2, Math.cos((center.lat * Math.PI) / 180));
  const stepM = CHUNK_SIZE * metersPerPx(center.lat, chunkZoom) * (1 - OVERLAP);
  const cols = Math.max(1, Math.ceil(sideM / stepM));
  const latStepDeg = stepM / 111320;
  const lngStepDeg = stepM / (111320 * cosLat);
  const neLat = center.lat + (sideM / 2) / 111320;
  const swLng = center.lng - (sideM / 2) / (111320 * cosLat);

  const chunks: { center: LatLng; zoom: number }[] = [];
  for (let r = 0; r < cols; r++) {
    for (let c = 0; c < cols; c++) {
      chunks.push({
        center: {
          lat: Math.min(85, Math.max(-85, neLat - (r + 0.5) * latStepDeg)),
          lng: swLng + (c + 0.5) * lngStepDeg,
        },
        zoom: chunkZoom,
      });
    }
  }
  return chunks;
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

async function fetchPreview(preview: { center: LatLng; zoom: number }) {
  const url = staticMapForScan(preview.center, preview.zoom, CHUNK_SIZE);
  if (!url) throw new Error('Map service unavailable');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Map request failed (${res.status})`);
  const blob = await res.blob();
  return { previewUrl: URL.createObjectURL(blob), width: CHUNK_SIZE * SCALE, height: CHUNK_SIZE * SCALE };
}

function supportsWorkerPath(): boolean {
  return typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined';
}

/** Runs chunk jobs across a pool of workers, one image at a time per worker. */
async function runChunkJobs(
  jobs: ChunkJob[],
  onProgress?: (done: number, total: number) => void,
): Promise<DetectedWater[][]> {
  const results: (DetectedWater[] | undefined)[] = new Array(jobs.length);
  if (jobs.length === 0) return [];
  const cores = typeof navigator !== 'undefined' && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 4;
  const poolSize = Math.max(1, Math.min(6, cores));

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
        const r = e.data as { id: number; candidates: DetectedWater[] };
        results[r.id] = r.candidates;
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

  return results.map((r) => r ?? []);
}

/** Fallback when Web Workers / OffscreenCanvas are unavailable: sequential on the main thread. */
async function analyzeChunkOnMain(job: ChunkJob): Promise<DetectedWater[]> {
  const res = await fetch(job.url);
  if (!res.ok) throw new Error(`Map request failed (${res.status})`);
  const blob = await res.blob();
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
  return regionsToDetectedWater(chosen, img.width, img.height, job.center, job.zoom, job.size);
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

  const chunkZoom = chooseChunkZoom(area.lat, radiusKm);
  const chunks = planChunks(area, radiusKm, chunkZoom);
  const mpp = metersPerPx(area.lat, chunkZoom);
  const minDiameterM = RADIUS_POND_SIZES_M[radiusKm]?.[sensitivity] ?? RADIUS_POND_SIZES_M[DEFAULT_RADIUS_KM]?.default ?? 250;
  const { minArea, minSide } = pondThresholds(minDiameterM, mpp);

  const bounds = regionBounds(area, radiusKm);
  const preview = fitPreview(bounds);
  const previewPromise = fetchPreview(preview);

  const jobs: ChunkJob[] = chunks.map((ch, id) => {
    const url = staticMapForScan(ch.center, ch.zoom, CHUNK_SIZE);
    if (!url) throw new Error('Map service unavailable');
    return { id, url, center: ch.center, zoom: ch.zoom, size: CHUNK_SIZE, minArea, minSide };
  });

  let perChunk: DetectedWater[][];
  if (supportsWorkerPath()) {
    perChunk = await runChunkJobs(jobs, opts?.onProgress);
  } else {
    perChunk = [];
    for (let i = 0; i < jobs.length; i++) {
      try {
        perChunk.push(await analyzeChunkOnMain(jobs[i]));
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

  return { candidates, previewUrl, width, height };
}
