import { Request, Response } from 'express';
import { ZodError } from 'zod';
import { logger } from '../../config/logger';
import { sendError } from '../utils/responseHandler';
import { API_ERROR_CODES } from '../constants/apiResponses';

interface AppError extends Error {
  status?: number;
  code?: string;
}

export const errorHandler = (err: AppError | ZodError, req: Request, res: Response, next: any) => {
  logger.error('Error handler called', {
    requestId: req.requestId,
    error: err.message,
    url: req.url,
    method: req.method,
  });

  if (err instanceof ZodError) {
    const errors = err.issues.map((e) => `${e.path.join('.')}: ${e.message}`);
    return sendError(res, API_ERROR_CODES.VALIDATION_FAILED, 400, errors);
  }

  return sendError(
    res,
    err.code || err.message || API_ERROR_CODES.INTERNAL_SERVER_ERROR,
    err.status || 500,
    process.env.NODE_ENV === 'development' ? err : undefined,
  );
};
