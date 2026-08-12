import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
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
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowed.includes(ext)) {
      cb(new ApiError(400, 'Image format not supported', 'IMAGE_TYPE_UNSUPPORTED'));
      return;
    }
    cb(null, true);
  },
});
