import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth } from '../middleware/auth';
import { upload } from '../middleware/upload';
import { ApiError } from '../middleware/errorHandler';
import { unlinkUpload } from '../utils/files';
import { publicUser } from '../utils/serialize';

const router = Router();

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user!.id;

    const [pois, comments, photos] = await Promise.all([
      prisma.poI.findMany({
        where: { createdById: userId },
        include: { _count: { select: { comments: true, photos: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.comment.findMany({
        where: { userId },
        include: { poi: { select: { id: true, name: true, lat: true, lng: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.photo.findMany({
        where: { userId },
        include: { poi: { select: { id: true, name: true, lat: true, lng: true } } },
        orderBy: { createdAt: 'desc' },
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

router.post('/me/avatar', requireAuth, upload.single('avatar'), async (req, res, next) => {
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
