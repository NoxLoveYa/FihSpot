import { Request, Response, NextFunction } from 'express';
import multer from 'multer';

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, message: string, code: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function notFound(req: Request, res: Response) {
  res.status(404).json({ error: 'Route not found', code: 'NOT_FOUND' });
}

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return;
  }

  if (err instanceof multer.MulterError) {
    const code = err.code === 'LIMIT_FILE_SIZE' ? 'FILE_TOO_LARGE' : 'UPLOAD_FAILED';
    res.status(400).json({ error: err.message, code });
    return;
  }

  console.error(err);
  res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
}
