import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth } from '../middleware/auth';
import { upload, validateImageUpload } from '../middleware/upload';
import { ApiError } from '../middleware/errorHandler';
import { unlinkUpload } from '../utils/files';
import { publicUser } from '../utils/serialize';
import { config } from '../config';

const router = Router();

// Profile content is rendered as a finite list; the cap keeps any single
// request (including the public one) from pulling unbounded rows.
const PROFILE_CONTENT_LIMIT = 200;

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user!.id;

    const [pois, comments, photos] = await Promise.all([
      prisma.poI.findMany({
        where: { createdById: userId, ...(config.demoEnabled ? {} : { demo: false }) },
        include: { _count: { select: { comments: true, photos: true } } },
        orderBy: { createdAt: 'desc' },
        take: PROFILE_CONTENT_LIMIT,
      }),
      prisma.comment.findMany({
        where: { userId },
        include: { poi: { select: { id: true, name: true, lat: true, lng: true } } },
        orderBy: { createdAt: 'desc' },
        take: PROFILE_CONTENT_LIMIT,
      }),
      prisma.photo.findMany({
        where: { userId },
        include: { poi: { select: { id: true, name: true, lat: true, lng: true } } },
        orderBy: { createdAt: 'desc' },
        take: PROFILE_CONTENT_LIMIT,
      }),
    ]);

    res.json({
      user: publicUser(req.user!),
      stats: { pois: pois.length, comments: comments.length, photos: photos.length },
      pois,
      comments,
      photos,
    });
  } catch (e) {
    next(e);
  }
});

router.get('/users/:id', async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');

    const [pois, comments, photos] = await Promise.all([
      prisma.poI.findMany({
        where: { createdById: user.id, ...(config.demoEnabled ? {} : { demo: false }) },
        include: { _count: { select: { comments: true, photos: true } } },
        orderBy: { createdAt: 'desc' },
        take: PROFILE_CONTENT_LIMIT,
      }),
      prisma.comment.findMany({
        where: { userId: user.id },
        include: { poi: { select: { id: true, name: true, lat: true, lng: true } } },
        orderBy: { createdAt: 'desc' },
        take: PROFILE_CONTENT_LIMIT,
      }),
      prisma.photo.findMany({
        where: { userId: user.id },
        include: { poi: { select: { id: true, name: true, lat: true, lng: true } } },
        orderBy: { createdAt: 'desc' },
        take: PROFILE_CONTENT_LIMIT,
      }),
    ]);

    const { email, ...safeUser } = publicUser(user);
    res.json({
      user: safeUser,
      stats: { pois: pois.length, comments: comments.length, photos: photos.length },
      pois,
      comments,
      photos,
    });
  } catch (e) {
    next(e);
  }
});

router.post('/me/avatar', requireAuth, upload.single('avatar'), validateImageUpload, async (req, res, next) => {
  try {
    if (!req.file) throw new ApiError(400, 'File missing', 'FILE_MISSING');

    const user = req.user!;
    if (user.avatarUrl?.startsWith('/uploads/')) {
      unlinkUpload(user.avatarUrl);
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { avatarUrl: `/uploads/${req.file.filename}` },
    });

    res.json({ user: publicUser(updated) });
  } catch (e) {
    next(e);
  }
});

export default router;
