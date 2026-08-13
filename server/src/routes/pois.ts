import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth } from '../middleware/auth';
import { upload } from '../middleware/upload';
import { ApiError } from '../middleware/errorHandler';
import { unlinkUpload } from '../utils/files';
import { config } from '../config';

const router = Router();

const poiInclude = {
  createdBy: { select: { id: true, name: true, avatarUrl: true } },
  comments: {
    include: { user: { select: { id: true, name: true, avatarUrl: true } } },
    orderBy: { createdAt: 'asc' as const },
  },
  photos: {
    include: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'asc' as const },
  },
};

function validateCoords(lat: unknown, lng: unknown) {
  const nLat = Number(lat);
  const nLng = Number(lng);
  if (!Number.isFinite(nLat) || nLat < -90 || nLat > 90) throw new ApiError(400, 'Invalid latitude', 'INVALID_LAT');
  if (!Number.isFinite(nLng) || nLng < -180 || nLng > 180) throw new ApiError(400, 'Invalid longitude', 'INVALID_LNG');
  return { lat: nLat, lng: nLng };
}

router.get('/', async (req, res, next) => {
  try {
    const { swLat, swLng, neLat, neLng, lastComment } = req.query as Record<string, string | undefined>;

    const pois = await prisma.poI.findMany({
      where: {
        ...(config.demoEnabled ? {} : { demo: false }),
        AND: swLat && swLng && neLat && neLng
          ? {
              lat: { gte: Number(swLat), lte: Number(neLat) },
              lng: { gte: Number(swLng), lte: Number(neLng) },
            }
          : undefined,
      },
      include: {
        createdBy: { select: { id: true, name: true, avatarUrl: true } },
        _count: { select: { comments: true, photos: true } },
        ...(lastComment === '1'
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

    res.json({ pois });
  } catch (e) {
    next(e);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const poi = await prisma.poI.findUnique({
      where: { id: req.params.id },
      include: poiInclude,
    });

    if (!poi) throw new ApiError(404, 'Point of interest not found', 'POI_NOT_FOUND');
    if (poi.demo && !config.demoEnabled) throw new ApiError(404, 'Point of interest not found', 'POI_NOT_FOUND');
    res.json({ poi });
  } catch (e) {
    next(e);
  }
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { name, description, category, lat, lng } = req.body as {
      name?: string;
      description?: string;
      category?: string;
      lat?: unknown;
      lng?: unknown;
    };

    if (!name?.trim()) throw new ApiError(400, 'Name is required', 'NAME_REQUIRED');
    const coords = validateCoords(lat, lng);

    const poi = await prisma.poI.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        category: category?.trim() || null,
        lat: coords.lat,
        lng: coords.lng,
        createdById: req.user!.id,
      },
    });

    res.status(201).json({ poi });
  } catch (e) {
    next(e);
  }
});

router.patch('/:id', requireAuth, async (req, res, next) => {
  try {
    const poi = await prisma.poI.findUnique({ where: { id: req.params.id } });
    if (!poi) throw new ApiError(404, 'Point of interest not found', 'POI_NOT_FOUND');
    if (poi.createdById !== req.user!.id) throw new ApiError(403, 'Action not authorized', 'UNAUTHORIZED');

    const { name, description, category } = req.body as {
      name?: string;
      description?: string;
      category?: string;
    };

    const updated = await prisma.poI.update({
      where: { id: poi.id },
      data: {
        name: name !== undefined ? name.trim() || poi.name : poi.name,
        description: description !== undefined ? description.trim() || null : poi.description,
        category: category !== undefined ? category.trim() || null : poi.category,
      },
    });

    res.json({ poi: updated });
  } catch (e) {
    next(e);
  }
});

router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const poi = await prisma.poI.findUnique({
      where: { id: req.params.id },
      include: { photos: { select: { url: true } } },
    });
    if (!poi) throw new ApiError(404, 'Point of interest not found', 'POI_NOT_FOUND');
    if (poi.createdById !== req.user!.id) throw new ApiError(403, 'Action not authorized', 'UNAUTHORIZED');

    const photoUrls = poi.photos.map((p) => p.url);
    await prisma.poI.delete({ where: { id: poi.id } });
    photoUrls.forEach(unlinkUpload);
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

router.post('/:id/comments', requireAuth, async (req, res, next) => {
  try {
    const { content } = req.body as { content?: string };
    if (!content?.trim()) throw new ApiError(400, 'Comment is empty', 'COMMENT_EMPTY');

    const poi = await prisma.poI.findUnique({ where: { id: req.params.id } });
    if (!poi) throw new ApiError(404, 'Point of interest not found', 'POI_NOT_FOUND');

    const comment = await prisma.comment.create({
      data: {
        content: content.trim(),
        poiId: poi.id,
        userId: req.user!.id,
      },
      include: { user: { select: { id: true, name: true, avatarUrl: true } } },
    });

    res.status(201).json({ comment });
  } catch (e) {
    next(e);
  }
});

router.delete('/comments/:commentId', requireAuth, async (req, res, next) => {
  try {
    const comment = await prisma.comment.findUnique({ where: { id: req.params.commentId } });
    if (!comment) throw new ApiError(404, 'Comment not found', 'COMMENT_NOT_FOUND');
    if (comment.userId !== req.user!.id) throw new ApiError(403, 'Action not authorized', 'UNAUTHORIZED');

    await prisma.comment.delete({ where: { id: comment.id } });
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

router.post('/:id/photos', requireAuth, upload.single('photo'), async (req, res, next) => {
  try {
    if (!req.file) throw new ApiError(400, 'File missing', 'FILE_MISSING');

    const poi = await prisma.poI.findUnique({ where: { id: req.params.id } });
    if (!poi) {
      throw new ApiError(404, 'Point of interest not found', 'POI_NOT_FOUND');
    }

    const photo = await prisma.photo.create({
      data: {
        url: `/uploads/${req.file.filename}`,
        poiId: poi.id,
        userId: req.user!.id,
      },
      include: { user: { select: { id: true, name: true } } },
    });

    res.status(201).json({ photo });
  } catch (e) {
    next(e);
  }
});

router.delete('/photos/:photoId', requireAuth, async (req, res, next) => {
  try {
    const photo = await prisma.photo.findUnique({ where: { id: req.params.photoId } });
    if (!photo) throw new ApiError(404, 'Photo not found', 'PHOTO_NOT_FOUND');
    if (photo.userId !== req.user!.id) throw new ApiError(403, 'Action not authorized', 'UNAUTHORIZED');

    await prisma.photo.delete({ where: { id: photo.id } });
    unlinkUpload(photo.url);
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

export default router;
