import { Request, Response } from 'express';
import { logger } from '../../config/logger';
import { sendError } from '../utils/responseHandler';

interface AppError extends Error {
  status?: number;
}

export const errorHandler = (err: AppError, req: Request, res: Response) => {
  logger.error(err, { url: req.url, method: req.method });

  return sendError(
    res,
    err.message || 'Internal Server Error',
    err.status || 500,
    process.env.NODE_ENV === 'development' ? err : undefined,
  );
};
