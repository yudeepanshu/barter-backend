import { Request, Response } from 'express';
import { ZodError } from 'zod';
import { logger } from '../../config/logger';
import { sendError } from '../utils/responseHandler';

interface AppError extends Error {
  status?: number;
}

export const errorHandler = (err: AppError | ZodError, req: Request, res: Response, next: any) => {
  logger.error('Error handler called', { error: err.message, url: req.url, method: req.method });

  if (err instanceof ZodError) {
    const errors = err.issues.map((e) => `${e.path.join('.')}: ${e.message}`);
    return sendError(res, 'Validation failed', 400, errors);
  }

  return sendError(
    res,
    err.message || 'Internal Server Error',
    err.status || 500,
    process.env.NODE_ENV === 'development' ? err : undefined,
  );
};
