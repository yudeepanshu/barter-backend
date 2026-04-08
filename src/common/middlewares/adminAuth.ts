import bcrypt from 'bcryptjs';
import { Request, Response, NextFunction } from 'express';
import { sendError } from '../utils/responseHandler';
import { config } from '../../config/env';
import { API_ERROR_CODES } from '../constants/apiResponses';

declare global {
  namespace Express {
    interface Request {
      isAdmin?: boolean;
    }
  }
}

export const adminAuth = (req: Request, res: Response, next: NextFunction) => {
  const adminKey = req.headers['x-admin-key'] as string;

  if (!adminKey) {
    return sendError(res, API_ERROR_CODES.ADMIN_KEY_REQUIRED, 401);
  }

  try {
    const isValid = bcrypt.compareSync(adminKey, config.ADMIN_KEY_HASH);
    if (!isValid) {
      return sendError(res, API_ERROR_CODES.INVALID_ADMIN_KEY, 401);
    }
    req.isAdmin = true;
    next();
  } catch (error) {
    return sendError(res, API_ERROR_CODES.INVALID_ADMIN_KEY, 401);
  }
};
