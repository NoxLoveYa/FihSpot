import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config';
import authRoutes from './routes/auth';
import poiRoutes from './routes/pois';
import searchRoutes from './routes/searches';
import scanRoutes from './routes/scan';
import geocodeRoutes from './routes/geocode';
import locationRoutes from './routes/locations';
import userRoutes from './routes/users';
import adminRoutes from './routes/admin';
import { notFound, errorHandler } from './middleware/errorHandler';
import { globalLimiter } from './middleware/rateLimit';

export function createApp() {
  const app = express();

  // The app always runs behind a single proxy hop (nginx in the client
  // container / Caddy / vite dev proxy), so trust exactly one hop for req.ip.
  app.set('trust proxy', 1);

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(globalLimiter);

  app.use(cors({ origin: config.clientUrl, credentials: true }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/pois', poiRoutes);
  app.use('/api/searches', searchRoutes);
  app.use('/api/scan', scanRoutes);
  app.use('/api/geocode', geocodeRoutes);
  app.use('/api/locations', locationRoutes);
  app.use('/api', userRoutes);
  app.use('/api/admin', adminRoutes);
  app.use(
    '/uploads',
    express.static(config.uploadsDir, {
      setHeaders(res) {
        // User-uploaded content must never execute in the site's origin, even
        // if a malicious file somehow got stored.
        res.set('X-Content-Type-Options', 'nosniff');
        res.set('Content-Security-Policy', 'sandbox');
      },
    }),
  );

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
