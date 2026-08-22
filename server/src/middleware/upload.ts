import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import fsp from 'fs/promises';
import type { NextFunction, Request, Response } from 'express';
import { config } from '../config';
import { ApiError } from './errorHandler';

fs.mkdirSync(config.uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, config.uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const name = crypto.randomBytes(16).toString('hex') + ext;
    cb(null, name);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    // No .svg: browsers execute scripts inside SVG, so an uploaded SVG would
    // be stored XSS when served same-origin.
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowed.includes(ext)) {
      cb(new ApiError(400, 'Image format not supported', 'IMAGE_TYPE_UNSUPPORTED'));
      return;
    }
    cb(null, true);
  },
});

// The extension check above only sees the client-declared filename. These are
// the real on-disk signatures for the formats we accept.
const MAGIC_BYTES: Array<{ exts: string[]; test: (buf: Buffer) => boolean }> = [
  { exts: ['.jpg', '.jpeg'], test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    exts: ['.png'],
    test: (b) =>
      b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a,
  },
  {
    exts: ['.gif'],
    test: (b) => b.subarray(0, 4).toString('ascii') === 'GIF8',
  },
  {
    exts: ['.webp'],
    test: (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
];

async function contentMatchesExtension(filePath: string, ext: string): Promise<boolean> {
  const handle = await fsp.open(filePath, 'r');
  try {
    const buf = Buffer.alloc(12);
    await handle.read(buf, 0, buf.length, 0);
    const rule = MAGIC_BYTES.find((m) => m.exts.includes(ext));
    // Unknown extension rule → already rejected by the filter; fail closed.
    return rule ? rule.test(buf) : false;
  } finally {
    await handle.close();
  }
}

/** Runs after multer wrote the temp file: verifies actual image content. */
export function validateImageUpload(req: Request, _res: Response, next: NextFunction) {
  const file = req.file;
  if (!file) return next();

  const ext = path.extname(file.originalname).toLowerCase();
  contentMatchesExtension(file.path, ext)
    .then((ok) => {
      if (!ok) {
        fs.promises.unlink(file.path).catch(() => {});
        next(new ApiError(400, 'Image format not supported', 'IMAGE_TYPE_UNSUPPORTED'));
        return;
      }
      next();
    })
    .catch(next);
}
