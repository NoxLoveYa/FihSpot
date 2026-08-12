import express from 'express';
import cors from 'cors';
import { config } from './config';
import authRoutes from './routes/auth';
import poiRoutes from './routes/pois';
import { notFound, errorHandler } from './middleware/errorHandler';

export function createApp() {
  const app = express();

  app.use(cors({ origin: config.clientUrl, credentials: true }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/pois', poiRoutes);
  app.use('/uploads', express.static(config.uploadsDir));

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
