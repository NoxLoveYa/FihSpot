import { Router } from 'express';
import { prisma } from '../prisma';
import { hashPassword, comparePassword } from '../utils/password';
import { signToken } from '../utils/jwt';
import { requireAuth } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { config } from '../config';

const router = Router();

function publicUser(user: { id: string; email: string; name: string; avatarUrl: string | null; createdAt: Date }) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt,
  };
}

router.post('/register', async (req, res, next) => {
  try {
    const { email, password, name } = req.body as { email?: string; password?: string; name?: string };

    if (!email || !password || !name) {
      throw new ApiError(400, 'Email, mot de passe et nom requis');
    }
    if (password.length < 6) {
      throw new ApiError(400, 'Mot de passe trop court (6 caractères minimum)');
    }

    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) {
      throw new ApiError(409, 'Un compte existe déjà avec cet email');
    }

    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        name,
        passwordHash: await hashPassword(password),
      },
    });

    res.status(201).json({ token: signToken(user.id), user: publicUser(user) });
  } catch (e) {
    next(e);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };

    if (!email || !password) {
      throw new ApiError(400, 'Email et mot de passe requis');
    }

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user?.passwordHash) {
      throw new ApiError(401, 'Email ou mot de passe incorrect');
    }

    const ok = await comparePassword(password, user.passwordHash);
    if (!ok) {
      throw new ApiError(401, 'Email ou mot de passe incorrect');
    }

    res.json({ token: signToken(user.id), user: publicUser(user) });
  } catch (e) {
    next(e);
  }
});

router.post('/google', async (req, res, next) => {
  try {
    const { idToken } = req.body as { idToken?: string };

    if (!idToken) {
      throw new ApiError(400, 'Token Google manquant');
    }

    const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new ApiError(401, 'Token Google invalide');
    }

    const payload = (await response.json()) as {
      sub: string;
      email?: string;
      name?: string;
      picture?: string;
    };

    if (!payload.sub) {
      throw new ApiError(401, 'Token Google invalide');
    }

    const email = payload.email?.toLowerCase() || `${payload.sub}@google.local`;
    let user = await prisma.user.findFirst({ where: { OR: [{ googleId: payload.sub }, { email }] } });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          name: payload.name || 'Utilisateur Google',
          googleId: payload.sub,
          avatarUrl: payload.picture || null,
        },
      });
    } else if (!user.googleId) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { googleId: payload.sub, avatarUrl: payload.picture || user.avatarUrl },
      });
    }

    res.json({ token: signToken(user.id), user: publicUser(user) });
  } catch (e) {
    next(e);
  }
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user!) });
});

router.get('/config', (_req, res) => {
  res.json({ googleClientId: config.googleClientId || null });
});

export default router;
