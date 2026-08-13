import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { findPoisInRadius } from '../services/search';

const router = Router();

function validateSearchInput(body: {
  name?: unknown;
  lat?: unknown;
  lng?: unknown;
  radiusKm?: unknown;
}) {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const nLat = Number(body.lat);
  const nLng = Number(body.lng);
  const nRadius = Number(body.radiusKm);

  if (!Number.isFinite(nLat) || nLat < -90 || nLat > 90)
    throw new ApiError(400, 'Invalid latitude', 'INVALID_LAT');
  if (!Number.isFinite(nLng) || nLng < -180 || nLng > 180)
    throw new ApiError(400, 'Invalid longitude', 'INVALID_LNG');
  if (!Number.isFinite(nRadius) || nRadius <= 0 || nRadius > 500)
    throw new ApiError(400, 'Invalid radius', 'INVALID_RADIUS');

  return {
    name: name || `Search at ${nLat.toFixed(3)}, ${nLng.toFixed(3)}`,
    lat: nLat,
    lng: nLng,
    radiusKm: nRadius,
  };
}

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const searches = await prisma.search.findMany({
      where: { userId: req.user!.id },
      orderBy: { updatedAt: 'desc' },
    });
    res.json({ searches });
  } catch (e) {
    next(e);
  }
});

router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const search = await prisma.search.findUnique({ where: { id: req.params.id } });
    if (!search) throw new ApiError(404, 'Saved search not found', 'SEARCH_NOT_FOUND');
    if (search.userId !== req.user!.id)
      throw new ApiError(403, 'Action not authorized', 'UNAUTHORIZED');

    const pois = await findPoisInRadius({
      lat: search.lat,
      lng: search.lng,
      radiusKm: search.radiusKm,
      userId: req.user!.id,
      lastComment: true,
    });

    res.json({ search, pois });
  } catch (e) {
    next(e);
  }
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const data = validateSearchInput(req.body);
    const search = await prisma.search.create({
      data: { ...data, userId: req.user!.id },
    });
    res.status(201).json({ search });
  } catch (e) {
    next(e);
  }
});

router.patch('/:id', requireAuth, async (req, res, next) => {
  try {
    const search = await prisma.search.findUnique({ where: { id: req.params.id } });
    if (!search) throw new ApiError(404, 'Saved search not found', 'SEARCH_NOT_FOUND');
    if (search.userId !== req.user!.id)
      throw new ApiError(403, 'Action not authorized', 'UNAUTHORIZED');

    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    if (!name) throw new ApiError(400, 'Name is required', 'NAME_REQUIRED');

    const updated = await prisma.search.update({
      where: { id: search.id },
      data: { name },
    });
    res.json({ search: updated });
  } catch (e) {
    next(e);
  }
});

router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const search = await prisma.search.findUnique({ where: { id: req.params.id } });
    if (!search) throw new ApiError(404, 'Saved search not found', 'SEARCH_NOT_FOUND');
    if (search.userId !== req.user!.id)
      throw new ApiError(403, 'Action not authorized', 'UNAUTHORIZED');

    await prisma.search.delete({ where: { id: search.id } });
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

export default router;
