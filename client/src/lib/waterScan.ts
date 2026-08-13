import { staticMapForScan } from './googleMaps';
import type { LatLng } from './googleMaps';

const EARTH_CIRC_M = 40075016.686;

export function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(s));
}

// Dark-theme water color as rendered by the interactive map (#68bfd9 = hsl(194,60,63)).
export const SCAN_WATER_COLOR = { hex: '#68bfd9', r: 104, g: 191, b: 217 };
const DARK_WATER = { r: SCAN_WATER_COLOR.r, g: SCAN_WATER_COLOR.g, b: SCAN_WATER_COLOR.b };

export function zoomForRadius(lat: number, radiusKm: number, size: number): number {
  const metersPerPx = (2 * radiusKm * 1000) / (size * 0.85);
  const zoom = Math.log2((EARTH_CIRC_M * Math.cos((lat * Math.PI) / 180)) / (256 * metersPerPx));
  return Math.round(Math.min(18, Math.max(3, zoom)));
}

export function latLngToWorld(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const world = 256 * 2 ** zoom;
  const x = ((lng + 180) / 360) * world;
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * world;
  return { x, y };
}

export function worldToLatLng(x: number, y: number, zoom: number): LatLng {
  const world = 256 * 2 ** zoom;
  const lng = (x / world) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / world;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { lat, lng };
}

export interface DetectedWater {
  lat: number;
  lng: number;
  areaPx: number;
  /** Pixel centroid in the analyzed image (for the preview overlay). */
  px: number;
  py: number;
}

export interface ScanResult {
  candidates: DetectedWater[];
  /** Blob URL of the exact styled static map that was analyzed. */
  previewUrl: string;
  /** Analyzed image dimensions (e.g. 1280×1280 with scale=2). */
  width: number;
  height: number;
}

export type ScanSensitivity = 'sensitive' | 'default' | 'strict';

export const SCAN_SENSITIVITIES: ScanSensitivity[] = ['sensitive', 'default', 'strict'];

interface SensitivityFactors {
  minSideFrac: number;
  minAreaFrac: number;
}

// Minimum pond size as a fraction of the analyzed image. Because it is
// expressed in pixels, it is automatically affected by the zoom level: zoomed
// in, a small pond covers many pixels and is detected; zoomed out, the same
// physical size shrinks below the threshold and is ignored.
const SCAN_SENSITIVITY_FACTORS: Record<ScanSensitivity, SensitivityFactors> = {
  sensitive: { minSideFrac: 0.006, minAreaFrac: 0.00008 },
  default: { minSideFrac: 0.01, minAreaFrac: 0.0002 },
  strict: { minSideFrac: 0.018, minAreaFrac: 0.0005 },
};

/**
 * Pixel thresholds used to consider a water body "a pond", constant in on-screen
 * pixels (so they scale with the map zoom). Larger values only accept bigger
 * water areas (rivers stay filtered by minSide).
 */
export function scanThresholds(sensitivity: ScanSensitivity, W: number, H: number) {
  const f = SCAN_SENSITIVITY_FACTORS[sensitivity] ?? SCAN_SENSITIVITY_FACTORS.default;
  return {
    minArea: Math.max(40, Math.round(W * H * f.minAreaFrac)),
    minSide: Math.max(4, Math.round(Math.min(W, H) * f.minSideFrac)),
  };
}

export interface WaterRegion {
  cx: number;
  cy: number;
  areaPx: number;
  touchesEdge: boolean;
  fraction: number;
  minDim: number;
}

export interface WaterAnalysis {
  regions: WaterRegion[];
  totalWaterPx: number;
}

/**
 * Pure analysis of a square RGBA pixel buffer. Finds water-colored regions
 * that are big enough to be ponds. Thin winding shapes (rivers) are rejected
 * by their poor area/perimeter thickness. Reported positions are snapped to a
 * real water pixel so they never land on land. Every region is kept, with
 * metadata the caller uses to apply the edge policy (ocean/sea vs ponds).
 */
export function analyzeWater(
  data: Uint8ClampedArray,
  W: number,
  H: number,
  targets: ReadonlyArray<{ r: number; g: number; b: number }>,
  tolerance: number,
  minArea: number,
  minSide: number,
  opts?: { blueDominance?: boolean },
): WaterAnalysis {
  const isWater = new Uint8Array(W * H);
  const useBlueDominance = opts?.blueDominance !== false;
  for (let i = 0; i < W * H; i++) {
    const o = i * 4;
    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];
    // Close to any known water color (exact color matching).
    const closeToWater = targets.some((t) => {
      const dr = r - t.r;
      const dg = g - t.g;
      const db = b - t.b;
      return Math.sqrt(dr * dr + dg * dg + db * db) <= tolerance;
    });
    // Blue-dominant fallback: catches deep/greenish water and any map theme.
    // Land, parks and roads are never blue-dominant.
    const blueDominant =
      useBlueDominance && b >= r + 12 && b >= g - 10 && b >= 120;
    if (closeToWater || blueDominant) isWater[i] = 1;
  }

  let totalWaterPx = 0;
  const visited = new Uint8Array(W * H);
  const found: WaterRegion[] = [];

  for (let i = 0; i < W * H; i++) {
    if (!isWater[i]) continue;
    totalWaterPx += 1;
    if (visited[i]) continue;

    let area = 0;
    let sumX = 0;
    let sumY = 0;
    let touchesEdge = false;
    const regionPixels: number[] = [];
    const stack = [i];
    visited[i] = 1;

    while (stack.length) {
      const cur = stack.pop() as number;
      const x = cur % W;
      const y = (cur / W) | 0;
      area += 1;
      sumX += x;
      sumY += y;
      regionPixels.push(cur);
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) touchesEdge = true;

      if (x + 1 < W && !visited[y * W + x + 1] && isWater[y * W + x + 1]) {
        visited[y * W + x + 1] = 1;
        stack.push(y * W + x + 1);
      }
      if (x - 1 >= 0 && !visited[y * W + x - 1] && isWater[y * W + x - 1]) {
        visited[y * W + x - 1] = 1;
        stack.push(y * W + x - 1);
      }
      if (y + 1 < H && !visited[(y + 1) * W + x] && isWater[(y + 1) * W + x]) {
        visited[(y + 1) * W + x] = 1;
        stack.push((y + 1) * W + x);
      }
      if (y - 1 >= 0 && !visited[(y - 1) * W + x] && isWater[(y - 1) * W + x]) {
        visited[(y - 1) * W + x] = 1;
        stack.push((y - 1) * W + x);
      }
    }

    if (area < minArea) continue;

    // Real thickness via area/perimeter: a thin winding river has a large
    // perimeter for its area (so 2·area/perimeter is small), while a round
    // pond of the same area has a large thickness. Rejects rivers far better
    // than a bounding-box minSide check.
    let edgePixels = 0;
    for (const p of regionPixels) {
      const x = p % W;
      const y = (p / W) | 0;
      let n = 0;
      if (x > 0 && isWater[y * W + x - 1]) n += 1;
      if (x < W - 1 && isWater[y * W + x + 1]) n += 1;
      if (y > 0 && isWater[(y - 1) * W + x]) n += 1;
      if (y < H - 1 && isWater[(y + 1) * W + x]) n += 1;
      if (n < 4) edgePixels += 1;
    }
    const thickness = (2 * area) / Math.max(1, edgePixels);
    if (thickness < minSide) continue;

    // The mean pixel position can fall in the concave gap next to a
    // kidney-shaped or winding water body. Snap it to the actual water pixel
    // closest to the centroid so the marker always lands on water.
    const cx0 = sumX / area;
    const cy0 = sumY / area;
    let bestIdx = regionPixels[0];
    let bestDist = Infinity;
    for (const p of regionPixels) {
      const x = p % W;
      const y = (p / W) | 0;
      const d = (x - cx0) * (x - cx0) + (y - cy0) * (y - cy0);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = p;
      }
    }

    found.push({
      cx: bestIdx % W,
      cy: (bestIdx / W) | 0,
      areaPx: area,
      touchesEdge,
      fraction: area / (W * H),
      minDim: Math.round(thickness),
    });
  }

  return { regions: found, totalWaterPx };
}

/**
 * Applies the pond-selection policy to a set of detected regions: keeps
 * enclosed ponds plus small edge-touching bodies, falls back to the biggest
 * body when the frame is mostly water, merges close centroids, sorts by size
 * and caps the result.
 */
function selectWaterCandidates(
  regions: WaterRegion[],
  totalWaterPx: number,
  W: number,
  H: number,
): WaterRegion[] {
  let chosen = regions.filter((r) => !r.touchesEdge || r.areaPx < W * H * 0.08);

  if (chosen.length === 0 && totalWaterPx > W * H * 0.5 && regions.length > 0) {
    const biggest = regions.reduce((a, b) => (b.areaPx > a.areaPx ? b : a), regions[0]);
    chosen = [biggest];
  }

  const merged: typeof chosen = [];
  for (const r of chosen) {
    const existing = merged.find((m) => Math.hypot(m.cx - r.cx, m.cy - r.cy) < 14);
    if (existing) {
      if (r.areaPx > existing.areaPx) {
        existing.cx = r.cx;
        existing.cy = r.cy;
        existing.areaPx = r.areaPx;
      }
    } else {
      merged.push(r);
    }
  }

  merged.sort((a, b) => b.areaPx - a.areaPx);
  return merged.slice(0, 12);
}

async function regionsFromImageData(
  img: ImageData,
  sensitivity: ScanSensitivity,
): Promise<{ regions: WaterRegion[]; totalWaterPx: number }> {
  const W = img.width;
  const H = img.height;
  // Exact color match — no tolerance, so green/near-water pixels are rejected.
  const tolerance = 0;
  const { minArea, minSide } = scanThresholds(sensitivity, W, H);
  return analyzeWater(img.data, W, H, [DARK_WATER], tolerance, minArea, minSide, {
    blueDominance: false,
  });
}

/**
 * Fetches a static map of the search area whose water is recolored to exactly
 * the dark-theme water color (#93dbee), then detects ponds of that exact color.
 */
export async function scanForWater(
  area: { lat: number; lng: number; radiusKm: number },
  sensitivity: ScanSensitivity = 'default',
  opts?: { mapZoom?: number },
): Promise<ScanResult> {
  const size = 640;
  // The static map is rendered at exactly the live map's zoom so the preview
  // matches the map view. The radius is used only to exclude far-away results.
  const zoom = Math.min(21, Math.max(3, Math.round(opts?.mapZoom ?? zoomForRadius(area.lat, area.radiusKm, size))));
  const url = staticMapForScan({ lat: area.lat, lng: area.lng }, zoom, size);
  if (!url) throw new Error('Map service unavailable');

  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new Error('Could not reach the map service');
  }
  if (!res.ok) throw new Error(`Map request failed (${res.status})`);

  const blob = await res.blob();
  // Kept alive and returned as `previewUrl` — the caller revokes it.
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
  if (!ctx) {
    URL.revokeObjectURL(objectUrl);
    throw new Error('Canvas unavailable');
  }
  ctx.drawImage(image, 0, 0);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);

  const { regions, totalWaterPx } = await regionsFromImageData(img, sensitivity);
  const chosen = selectWaterCandidates(regions, totalWaterPx, img.width, img.height);

  // The image is requested as `size` but may come back at a higher resolution
  // (scale=2 → 2× pixels). World-coordinate offsets must be scaled down by the
  // image/request pixel ratio, otherwise points land twice as far from center.
  const worldPerImagePx = size / img.width;
  const worldCenter = latLngToWorld(area.lat, area.lng, zoom);
  const candidates = chosen
    .map((r) => {
      const wx = worldCenter.x + (r.cx - img.width / 2) * worldPerImagePx;
      const wy = worldCenter.y + (r.cy - img.height / 2) * worldPerImagePx;
      return { ...worldToLatLng(wx, wy, zoom), areaPx: r.areaPx, px: r.cx, py: r.cy };
    })
    // The static image is a square larger than the search circle; only report
    // water bodies whose center is inside the requested radius.
    .filter((c) => haversineKm(c, area) <= area.radiusKm);

  return { candidates, previewUrl: objectUrl, width: img.width, height: img.height };
}
