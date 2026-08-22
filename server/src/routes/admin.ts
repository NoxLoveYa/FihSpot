import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { hashPassword } from '../utils/password';
import { isAdminEmail } from '../utils/admin';
import { assertMaxLength } from '../utils/validate';
import { deleteCommentById, deletePhotoWithFile, deletePoiWithFiles, deleteUserWithContent } from '../services/content';

const router = Router();

router.use(requireAuth, requireAdmin);

router.get('/stats', async (_req, res, next) => {
  try {
    const [users, pois, comments, photos, demoPois, recentUsers] = await Promise.all([
      prisma.user.count(),
      prisma.poI.count(),
      prisma.comment.count(),
      prisma.photo.count(),
      prisma.poI.count({ where: { demo: true } }),
      prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, name: true, email: true, avatarUrl: true, role: true, createdAt: true },
      }),
    ]);

    res.json({ stats: { users, pois, comments, photos, demoPois }, recentUsers });
  } catch (e) {
    next(e);
  }
});

router.get('/users', async (req, res, next) => {
  try {
    const { search, sort, page } = req.query as Record<string, string | undefined>;
    const take = 20;
    const skip = Math.max(0, (Number(page) || 1) - 1) * take;

    const where = search?.trim()
      ? {
          OR: [
            { name: { contains: search.trim(), mode: 'insensitive' as const } },
            { email: { contains: search.trim().toLowerCase(), mode: 'insensitive' as const } },
          ],
        }
      : {};

    const orderBy =
      sort === 'name'
        ? [{ name: 'asc' as const }]
        : sort === 'role'
          ? [{ role: 'asc' as const }, { createdAt: 'desc' as const }]
          : [{ createdAt: 'desc' as const }];

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        take,
        skip,
        orderBy,
        select: {
          id: true,
          email: true,
          name: true,
          avatarUrl: true,
          role: true,
          searchEnabled: true,
          createdAt: true,
          _count: { select: { pois: true, comments: true, photos: true } },
        },
      }),
    ]);

    res.json({ users, total, page: Number(page) || 1, pages: Math.max(1, Math.ceil(total / take)) });
  } catch (e) {
    next(e);
  }
});

router.patch('/users/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, email, role, password, searchEnabled } = req.body as {
      name?: string;
      email?: string;
      role?: string;
      password?: string;
      searchEnabled?: boolean;
    };

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');

    assertMaxLength('Name', 'NAME_TOO_LONG', 100, name);
    assertMaxLength('Email', 'EMAIL_TOO_LONG', 254, email);
    assertMaxLength('Password', 'PASSWORD_TOO_LONG', 100, password);

    const isSelf = id === req.user!.id;
    if (role && role !== 'USER' && role !== 'ADMIN') {
      throw new ApiError(400, 'Invalid role', 'INVALID_ROLE');
    }

    const newRole = role === 'ADMIN' ? 'ADMIN' : role === 'USER' ? 'USER' : target.role;

    if (isSelf && newRole === 'USER' && target.role === 'ADMIN') {
      throw new ApiError(400, 'You cannot demote yourself', 'CANNOT_DEMOTE_SELF');
    }

    if (isAdminEmail(email || target.email) && newRole === 'USER') {
      throw new ApiError(400, 'Cannot demote an admin email', 'ADMIN_EMAIL_FIXED');
    }

    const data: {
      name?: string;
      email?: string;
      role?: 'USER' | 'ADMIN';
      passwordHash?: string;
      searchEnabled?: boolean;
    } = {};

    if (name !== undefined) data.name = name.trim() || target.name;
    if (email !== undefined) data.email = email.trim().toLowerCase() || target.email;
    if (role !== undefined) data.role = newRole;
    if (searchEnabled !== undefined) data.searchEnabled = Boolean(searchEnabled);
    if (password !== undefined) {
      if (password.length < 6) throw new ApiError(400, 'Password too short (minimum 6 characters)', 'PASSWORD_TOO_SHORT');
      data.passwordHash = await hashPassword(password);
    }

    const updated = await prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        role: true,
        searchEnabled: true,
        createdAt: true,
      },
    });

    res.json({ user: updated });
  } catch (e) {
    next(e);
  }
});

router.delete('/users/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (id === req.user!.id) throw new ApiError(400, 'You cannot delete your own account', 'CANNOT_DELETE_SELF');

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');

    await deleteUserWithContent(id);
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

router.get('/pois', async (req, res, next) => {
  try {
    const { search, page, userIds } = req.query as Record<string, string | undefined>;
    const take = 20;
    const skip = Math.max(0, (Number(page) || 1) - 1) * take;

    const ids = userIds?.split(',').filter(Boolean);
    const conditions: Record<string, unknown>[] = [];
    if (search?.trim()) {
      conditions.push({
        OR: [
          { name: { contains: search.trim(), mode: 'insensitive' as const } },
          { description: { contains: search.trim(), mode: 'insensitive' as const } },
        ],
      });
    }
    if (ids && ids.length > 0) {
      conditions.push({ createdById: { in: ids } });
    }
    const where = conditions.length > 0 ? { AND: conditions } : {};

    const [total, pois] = await Promise.all([
      prisma.poI.count({ where }),
      prisma.poI.findMany({
        where,
        take,
        skip,
        orderBy: { createdAt: 'desc' },
        include: {
          createdBy: { select: { id: true, name: true, avatarUrl: true } },
          _count: { select: { comments: true, photos: true } },
        },
      }),
    ]);

    res.json({ pois, total, page: Number(page) || 1, pages: Math.max(1, Math.ceil(total / take)) });
  } catch (e) {
    next(e);
  }
});

router.patch('/pois/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description, category, demo } = req.body as {
      name?: string;
      description?: string | null;
      category?: string | null;
      demo?: boolean;
    };

    const poi = await prisma.poI.findUnique({ where: { id } });
    if (!poi) throw new ApiError(404, 'Point of interest not found', 'POI_NOT_FOUND');

    const updated = await prisma.poI.update({
      where: { id },
      data: {
        name: name !== undefined ? name.trim() || poi.name : poi.name,
        description: description !== undefined ? description?.trim() || null : poi.description,
        category: category !== undefined ? category?.trim() || null : poi.category,
        demo: demo !== undefined ? Boolean(demo) : poi.demo,
      },
    });

    res.json({ poi: updated });
  } catch (e) {
    next(e);
  }
});

router.delete('/pois/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const poi = await prisma.poI.findUnique({ where: { id } });
    if (!poi) throw new ApiError(404, 'Point of interest not found', 'POI_NOT_FOUND');

    await deletePoiWithFiles(id);
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

router.get('/moderation', async (req, res, next) => {
  try {
    const { type, userIds } = req.query as Record<string, string | undefined>;
    const ids = userIds?.split(',').filter(Boolean);
    const where = ids && ids.length > 0 ? { userId: { in: ids } } : {};

    if (type === 'comments') {
      const comments = await prisma.comment.findMany({
        where,
        take: 50,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, name: true, avatarUrl: true } },
          poi: { select: { id: true, name: true } },
        },
      });
      res.json({ comments });
      return;
    }

    const photos = await prisma.photo.findMany({
      where,
      take: 50,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, name: true, avatarUrl: true } },
        poi: { select: { id: true, name: true } },
      },
    });
    res.json({ photos });
  } catch (e) {
    next(e);
  }
});

router.delete('/comments/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const comment = await prisma.comment.findUnique({ where: { id } });
    if (!comment) throw new ApiError(404, 'Comment not found', 'COMMENT_NOT_FOUND');

    await deleteCommentById(id);
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

router.delete('/photos/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const photo = await prisma.photo.findUnique({ where: { id } });
    if (!photo) throw new ApiError(404, 'Photo not found', 'PHOTO_NOT_FOUND');

    await deletePhotoWithFile(id);
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

export default router;
