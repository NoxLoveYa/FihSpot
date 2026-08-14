import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { publicUser } from '../utils/serialize';

// Live shared positions, kept in memory (the sharing *preference* is persisted
// in the DB). A position is only present while the user actively reports it and
// ages out shortly after they stop.
const LIVE = new Map<string, { lat: number; lng: number; updatedAt: number }>();

const STALE_MS = 60_000;

function pruneStale() {
  const now = Date.now();
  for (const [id, p] of LIVE) {
    if (now - p.updatedAt > STALE_MS) LIVE.delete(id);
  }
}

const router = Router();

router.post('/share', requireAuth, async (req, res, next) => {
  try {
    const enabled = req.body?.enabled;
    if (typeof enabled !== 'boolean') {
      throw new ApiError(400, 'enabled must be a boolean', 'INVALID_BODY');
    }
    const updated = await prisma.user.update({
      where: { id: req.user!.id },
      data: { shareLocation: enabled },
    });
    if (!enabled) LIVE.delete(updated.id);
    res.json({ user: publicUser(updated) });
  } catch (e) {
    next(e);
  }
});

router.post('/', requireAuth, (req, res, next) => {
  try {
    const { lat, lng } = req.body as { lat?: unknown; lng?: unknown };
    if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new ApiError(400, 'lat and lng must be numbers', 'INVALID_BODY');
    }
    if (req.user!.shareLocation) {
      LIVE.set(req.user!.id, { lat, lng, updatedAt: Date.now() });
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.get('/', requireAuth, async (req, res, next) => {
  try {
    pruneStale();
    const ids = [...LIVE.keys()];
    if (ids.length === 0) {
      res.json({ locations: [] });
      return;
    }
    const users = await prisma.user.findMany({
      where: { id: { in: ids }, shareLocation: true },
      select: { id: true, name: true, avatarUrl: true },
    });
    res.json({
      locations: users
        .map((u) => {
          const p = LIVE.get(u.id);
          return p
            ? {
                userId: u.id,
                name: u.name,
                avatarUrl: u.avatarUrl,
                lat: p.lat,
                lng: p.lng,
                updatedAt: new Date(p.updatedAt).toISOString(),
              }
            : null;
        })
        .filter((x): x is NonNullable<typeof x> => x !== null),
    });
  } catch (e) {
    next(e);
  }
});

export default router;
