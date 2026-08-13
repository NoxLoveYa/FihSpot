import { prisma } from '../prisma';
import { config } from '../config';

const EARTH_RADIUS_KM = 6371;

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

interface FindInRadiusParams {
  lat: number;
  lng: number;
  radiusKm: number;
  userId?: string | null;
  lastComment?: boolean;
}

export async function findPoisInRadius({ lat, lng, radiusKm, userId, lastComment }: FindInRadiusParams) {
  const kmPerDegLat = 111.32;
  const latDelta = radiusKm / kmPerDegLat;
  const lngDelta = radiusKm / (kmPerDegLat * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));

  const candidates = await prisma.poI.findMany({
    where: {
      ...(config.demoEnabled ? {} : { demo: false }),
      lat: { gte: lat - latDelta, lte: lat + latDelta },
      lng: { gte: lng - lngDelta, lte: lng + lngDelta },
    },
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
  });

  const seenIds = new Set<string>();
  if (userId) {
    const seen = await prisma.seenPoi.findMany({
      where: { userId, poiId: { in: candidates.map((p) => p.id) } },
      select: { poiId: true },
    });
    seen.forEach((s) => seenIds.add(s.poiId));
  }

  const pois = candidates
    .map((poi) => ({
      ...poi,
      distanceKm: haversineKm(lat, lng, poi.lat, poi.lng),
    }))
    .filter((poi) => poi.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .map((poi) => ({ ...poi, seen: seenIds.has(poi.id) }));

  return pois;
}
