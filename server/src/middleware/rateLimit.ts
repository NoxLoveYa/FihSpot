import rateLimit from 'express-rate-limit';

// JSON bodies match the API's error shape ({ error, code }) so the client
// renders them like any other ApiError.
const jsonOptions = {
  standardHeaders: true,
  legacyHeaders: false,
};

/**
 * Bucket for everything else. Generous on purpose: location pings and map
 * tiles are chatty, so this only catches abusive clients.
 */
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1000,
  ...jsonOptions,
});

/** Login / Google sign-in: brute-force protection per IP. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: { error: 'Too many attempts, try again later', code: 'RATE_LIMITED' },
  ...jsonOptions,
});

/** Account creation: slow down mass registrations. */
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  message: { error: 'Too many attempts, try again later', code: 'RATE_LIMITED' },
  ...jsonOptions,
});

/**
 * Scan tiles: a full scan bursts up to ~65 tile requests, so the ceiling
 * allows several scans per window while capping Google Static Maps spend.
 */
export const scanLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  message: { error: 'Too many requests, try again later', code: 'RATE_LIMITED' },
  ...jsonOptions,
});
