// Web Worker: resolves one scan tile from our server (which proxies the Google
// Maps Static API and caches tiles server-side), decodes it and runs the water
// detection, so several tiles are analyzed in parallel off the main thread and
// repeat scans are served by the server's tile cache.

import {
  analyzeWater,
  DARK_WATER,
  regionsToDetectedWater,
  selectWaterCandidates,
} from './waterAnalysis';
import type { DetectedWater, LatLng } from './waterAnalysis';

export interface ChunkJob {
  id: number;
  url: string;
  token: string;
  center: LatLng;
  zoom: number;
  size: number;
  minArea: number;
  minSide: number;
}

export interface ChunkResult {
  id: number;
  candidates: DetectedWater[];
  /** true when the tile image came from the server's cache (X-Cache: HIT). */
  cached?: boolean;
  error?: string;
}

const workerScope = self as unknown as {
  postMessage: (message: ChunkResult) => void;
  onmessage: ((e: MessageEvent<ChunkJob>) => void) | null;
};

async function resolveImage(url: string, token: string): Promise<{ response: Response; cached: boolean }> {
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) throw new Error(`Map request failed (${res.status})`);
  return { response: res, cached: res.headers.get('X-Cache') === 'HIT' };
}

workerScope.onmessage = async (e: MessageEvent<ChunkJob>) => {
  const job = e.data;
  try {
    const { response, cached } = await resolveImage(job.url, job.token);
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);

    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const W = img.width;
    const H = img.height;
    const { minArea, minSide } = job;
    const { regions } = analyzeWater(img.data, W, H, [DARK_WATER], 0, minArea, minSide, {
      blueDominance: false,
    });
    const chosen = selectWaterCandidates(regions, W, H);
    const candidates = regionsToDetectedWater(chosen, W, H, job.center, job.zoom, job.size);

    workerScope.postMessage({ id: job.id, candidates, cached });
  } catch (err) {
    workerScope.postMessage({
      id: job.id,
      candidates: [],
      cached: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
