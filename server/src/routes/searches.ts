import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth, requireSearchAccess } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { findPoisInBounds, viewportBounds } from '../services/search';

const router = Router();

// Saved searches belong to the spot-search feature: only admins or users with
// explicit search access can use them.
router.use(requireAuth, requireSearchAccess);

function validateSearchInput(body: { name?: unknown; lat?: unknown; lng?: unknown; zoom?: unknown }) {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const nLat = Number(body.lat);
  const nLng = Number(body.lng);
  const nZoom = body.zoom === undefined ? 14 : Number(body.zoom);

  if (!Number.isFinite(nLat) || nLat < -90 || nLat > 90)
    throw new ApiError(400, 'Invalid latitude', 'INVALID_LAT');
  if (!Number.isFinite(nLng) || nLng < -180 || nLng > 180)
    throw new ApiError(400, 'Invalid longitude', 'INVALID_LNG');
  if (!Number.isInteger(nZoom) || nZoom < 1 || nZoom > 21)
    throw new ApiError(400, 'Invalid zoom', 'INVALID_ZOOM');

  return {
    name: name || `Search at ${nLat.toFixed(3)}, ${nLng.toFixed(3)}`,
    lat: nLat,
    lng: nLng,
    zoom: nZoom,
  };
}

router.get('/', async (req, res, next) => {
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

router.get('/:id', async (req, res, next) => {
  try {
    const search = await prisma.search.findUnique({ where: { id: req.params.id } });
    if (!search) throw new ApiError(404, 'Saved search not found', 'SEARCH_NOT_FOUND');
    if (search.userId !== req.user!.id)
      throw new ApiError(403, 'Action not authorized', 'UNAUTHORIZED');

    const bounds = viewportBounds(search.lat, search.lng, search.zoom);
    const pois = await findPoisInBounds({
      swLat: bounds.swLat,
      swLng: bounds.swLng,
      neLat: bounds.neLat,
      neLng: bounds.neLng,
      userId: req.user!.id,
      lastComment: true,
    });

    res.json({ search, pois });
  } catch (e) {
    next(e);
  }
});

router.post('/', async (req, res, next) => {
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

router.patch('/:id', async (req, res, next) => {
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

router.delete('/:id', async (req, res, next) => {
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
