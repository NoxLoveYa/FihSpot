import { prisma } from '../prisma';
import { config } from '../config';

interface FindInBoundsParams {
  swLat: number;
  swLng: number;
  neLat: number;
  neLng: number;
  userId?: string | null;
  lastComment?: boolean;
}

/**
 * Hard ceiling on any single bounds query, even the whole-world default. The
 * client renders the full list at once and this stays far above real usage,
 * but it keeps an anonymous caller from pulling unbounded rows in one request.
 */
export const MAX_POIS_PER_QUERY = 2000;

export async function findPoisInBounds({ swLat, swLng, neLat, neLng, userId, lastComment }: FindInBoundsParams) {
  const pois = await prisma.poI.findMany({
    where: {
      ...(config.demoEnabled ? {} : { demo: false }),
      lat: { gte: swLat, lte: neLat },
      lng: { gte: swLng, lte: neLng },
    },
    take: MAX_POIS_PER_QUERY,
    include: {
      createdBy: { select: { id: true, name: true, avatarUrl: true } },
      _count: { select: { comments: true, photos: true } },
      ...(lastComment
        ? {
            comments: {
              take: 1,
              orderBy: { createdAt: 'desc' as const },
              include: { user: { select: { id: true, name: true, avatarUrl: true } } },
            },
          }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
  });

  const seenIds = new Set<string>();
  if (userId) {
    const seen = await prisma.seenPoi.findMany({
      where: { userId, poiId: { in: pois.map((p) => p.id) } },
      select: { poiId: true },
    });
    seen.forEach((s) => seenIds.add(s.poiId));
  }

  return pois.map((p) => ({ ...p, seen: seenIds.has(p.id) }));
}

const EARTH_CIRC_M = 40075016.686;
const KM_PER_DEG_LAT = 111.32;

/**
 * Lat/lng bounds of a Web-Mercator viewport centered on (lat, lng) at the given
 * zoom level. The zone we scan/search is defined by the map viewport, so saved
 * searches store their zoom and it is turned back into a bounding box here.
 */
export function viewportBounds(
  lat: number,
  lng: number,
  zoom: number,
  widthPx = 800,
  heightPx = 600,
): { swLat: number; swLng: number; neLat: number; neLng: number } {
  const metersPerPx = (EARTH_CIRC_M * Math.cos((lat * Math.PI) / 180)) / (256 * 2 ** zoom);
  const latDelta = ((heightPx / 2) * metersPerPx) / 1000 / KM_PER_DEG_LAT;
  const lngDelta = ((widthPx / 2) * metersPerPx) / 1000 / (KM_PER_DEG_LAT * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  return {
    swLat: Math.max(-85, lat - latDelta),
    swLng: lng - lngDelta,
    neLat: Math.min(85, lat + latDelta),
    neLng: lng + lngDelta,
  };
}
