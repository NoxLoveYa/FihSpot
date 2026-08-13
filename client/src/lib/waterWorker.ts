// Web Worker: fetches one static map chunk, decodes it and runs the water
// detection, so several chunks are analyzed in parallel off the main thread.

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
  center: LatLng;
  zoom: number;
  size: number;
  minArea: number;
  minSide: number;
}

export interface ChunkResult {
  id: number;
  candidates: DetectedWater[];
  error?: string;
}

const workerScope = self as unknown as {
  postMessage: (message: ChunkResult) => void;
  onmessage: ((e: MessageEvent<ChunkJob>) => void) | null;
};

workerScope.onmessage = async (e: MessageEvent<ChunkJob>) => {
  const job = e.data;
  try {
    const res = await fetch(job.url);
    if (!res.ok) throw new Error(`Map request failed (${res.status})`);
    const blob = await res.blob();
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

    workerScope.postMessage({ id: job.id, candidates });
  } catch (err) {
    workerScope.postMessage({ id: job.id, candidates: [], error: err instanceof Error ? err.message : String(err) });
  }
};
