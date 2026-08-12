import { Request, Response, NextFunction } from 'express';
import multer from 'multer';

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function notFound(req: Request, res: Response) {
  res.status(404).json({ error: 'Route introuvable' });
}

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: err.message });
    return;
  }

  if (err instanceof multer.MulterError) {
    res.status(400).json({ error: err.message });
    return;
  }

  console.error(err);
  res.status(500).json({ error: 'Erreur interne du serveur' });
}
