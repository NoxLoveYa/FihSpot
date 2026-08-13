import { Router } from 'express';
import { prisma } from '../prisma';
import { hashPassword, comparePassword } from '../utils/password';
import { signToken } from '../utils/jwt';
import { requireAuth } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { config } from '../config';
import { publicUser } from '../utils/serialize';
import { isAdminEmail, syncAdminRole } from '../utils/admin';

const router = Router();

router.post('/register', async (req, res, next) => {
  try {
    const { email, password, name } = req.body as { email?: string; password?: string; name?: string };

    if (!email || !password || !name) {
      throw new ApiError(400, 'Email, password and name are required', 'MISSING_FIELDS');
    }
    if (password.length < 6) {
      throw new ApiError(400, 'Password too short (minimum 6 characters)', 'PASSWORD_TOO_SHORT');
    }

    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) {
      throw new ApiError(409, 'An account already exists with this email', 'EMAIL_TAKEN');
    }

    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        name,
        passwordHash: await hashPassword(password),
        role: isAdminEmail(email) ? 'ADMIN' : 'USER',
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
      throw new ApiError(400, 'Email and password are required', 'LOGIN_FIELDS_REQUIRED');
    }

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user?.passwordHash) {
      throw new ApiError(401, 'Incorrect email or password', 'INVALID_CREDENTIALS');
    }

    const ok = await comparePassword(password, user.passwordHash);
    if (!ok) {
      throw new ApiError(401, 'Incorrect email or password', 'INVALID_CREDENTIALS');
    }

    const synced = await syncAdminRole(user);
    res.json({ token: signToken(synced.id), user: publicUser(synced) });
  } catch (e) {
    next(e);
  }
});

router.post('/google', async (req, res, next) => {
  try {
    const { idToken } = req.body as { idToken?: string };

    if (!idToken) {
      throw new ApiError(400, 'Google token missing', 'GOOGLE_TOKEN_MISSING');
    }

    const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new ApiError(401, 'Invalid Google token', 'GOOGLE_TOKEN_INVALID');
    }

    const payload = (await response.json()) as {
      sub: string;
      email?: string;
      name?: string;
      picture?: string;
    };

    if (!payload.sub) {
      throw new ApiError(401, 'Invalid Google token', 'GOOGLE_TOKEN_INVALID');
    }

    const email = payload.email?.toLowerCase() || `${payload.sub}@google.local`;
    let user = await prisma.user.findFirst({ where: { OR: [{ googleId: payload.sub }, { email }] } });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          name: payload.name || 'Google User',
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

    const synced = await syncAdminRole(user);
    res.json({ token: signToken(synced.id), user: publicUser(synced) });
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
