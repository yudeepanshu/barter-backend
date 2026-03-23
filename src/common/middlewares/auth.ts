import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { sendError } from '../utils/responseHandler';
import { config } from '../../config/env';

export const protect = (req: Request, res: Response, next: NextFunction) => {
  const SECRET = config.ACCESS_SECRET;
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return sendError(res, 'Unauthorized', 401);
  }

  try {
    const decoded: any = jwt.verify(token, SECRET);
    req.user = decoded;
    console.log('1111222Auth Middleware - Token:', token, decoded);
    next();
  } catch {
    return sendError(res, 'Invalid token', 401);
  }
};
