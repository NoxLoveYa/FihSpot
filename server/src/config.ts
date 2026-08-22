import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const MIN_SECRET_LENGTH = 32;

function resolveJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        `JWT_SECRET must be set to at least ${MIN_SECRET_LENGTH} characters in production`,
      );
    }
    return 'dev-secret-change-me';
  }
  return secret;
}

export const config = {
  port: Number(process.env.PORT || 3000),
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://fihspot:fihspot@localhost:5432/fihspot',
  jwtSecret: resolveJwtSecret(),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  googleMapsServerKey: process.env.GOOGLE_MAPS_SERVER_KEY || '',
  uploadsDir: path.resolve(__dirname, '../uploads'),
  scanCacheDir: path.resolve(__dirname, '../cache/scan-tiles'),
  demoEnabled: process.env.NODE_ENV !== 'production',
  adminEmails: (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
};
