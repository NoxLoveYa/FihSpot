import { Request, Response, NextFunction } from 'express';
import { prisma } from '../prisma';
import { verifyToken } from '../utils/jwt';
import { syncAdminRole } from '../utils/admin';

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Not authenticated', code: 'NOT_AUTHENTICATED' });
    return;
  }

  const userId = verifyToken(header.slice(7));
  if (!userId) {
    res.status(401).json({ error: 'Invalid or expired session', code: 'INVALID_SESSION' });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    res.status(401).json({ error: 'User not found', code: 'USER_NOT_FOUND' });
    return;
  }

  const synced = await syncAdminRole(user);
  req.user = synced;
  next();
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated', code: 'NOT_AUTHENTICATED' });
    return;
  }
  if (req.user.role !== 'ADMIN') {
    res.status(403).json({ error: 'Admin access required', code: 'ADMIN_REQUIRED' });
    return;
  }
  next();
}
