import { Request, Response, NextFunction } from 'express';
import { prisma } from '../prisma';
import { verifyToken } from '../utils/jwt';

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Non authentifié' });
    return;
  }

  const userId = verifyToken(header.slice(7));
  if (!userId) {
    res.status(401).json({ error: 'Session invalide ou expirée' });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    res.status(401).json({ error: 'Utilisateur introuvable' });
    return;
  }

  req.user = user;
  next();
}
