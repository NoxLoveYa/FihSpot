// Pure water-detection pipeline. No DOM, no network, no Google Maps imports —
// shared between the main thread and the scan Web Worker.

export type LatLng = { lat: number; lng: number };

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
export const DARK_WATER = { r: 104, g: 191, b: 217 };

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

export type ScanSensitivity = 'sensitive' | 'default' | 'strict';

export const SCAN_SENSITIVITIES: ScanSensitivity[] = ['sensitive', 'default', 'strict'];

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
    const blueDominant = useBlueDominance && b >= r + 12 && b >= g - 10 && b >= 120;
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
 * enclosed ponds plus small edge-touching bodies (so ponds straddling a chunk
 * border are still reported), merges close centroids, sorts by size and caps
 * the result.
 */
export function selectWaterCandidates(
  regions: WaterRegion[],
  W: number,
  H: number,
): WaterRegion[] {
  const chosen = regions.filter((r) => !r.touchesEdge || r.areaPx < W * H * 0.08);

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

/**
 * Converts selected regions (pixel coords in the analyzed image) to
 * geolocated candidates. The image is requested as `size` but may come back at
 * a higher resolution (scale=2 → 2× pixels); world-coordinate offsets must be
 * scaled down by the image/request pixel ratio.
 */
export function regionsToDetectedWater(
  regions: WaterRegion[],
  W: number,
  H: number,
  center: LatLng,
  zoom: number,
  size: number,
): DetectedWater[] {
  const worldPerImagePx = size / W;
  const worldCenter = latLngToWorld(center.lat, center.lng, zoom);
  return regions.map((r) => {
    const wx = worldCenter.x + (r.cx - W / 2) * worldPerImagePx;
    const wy = worldCenter.y + (r.cy - H / 2) * worldPerImagePx;
    return { ...worldToLatLng(wx, wy, zoom), areaPx: r.areaPx, px: r.cx, py: r.cy };
  });
}
