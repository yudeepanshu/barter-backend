import bcrypt from 'bcryptjs';
import { Request, Response, NextFunction } from 'express';
import { sendError } from '../utils/responseHandler';
import { config } from '../../config/env';

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
    return sendError(res, 'Admin key required', 401);
  }

  try {
    const isValid = bcrypt.compareSync(adminKey, config.ADMIN_KEY_HASH);
    if (!isValid) {
      return sendError(res, 'Invalid admin key', 401);
    }
    req.isAdmin = true;
    next();
  } catch (error) {
    return sendError(res, 'Invalid admin key', 401);
  }
};
