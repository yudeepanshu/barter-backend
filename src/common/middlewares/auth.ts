import jwt, { JwtPayload } from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { sendError } from '../utils/responseHandler';
import { config } from '../../config/env';
import { API_ERROR_CODES } from '../constants/apiResponses';

const parseAccessPayload = (decoded: string | JwtPayload): Express.Request['user'] => {
  if (typeof decoded === 'string' || typeof decoded.id !== 'string') {
    return undefined;
  }

  return {
    id: decoded.id,
    iat: decoded.iat,
    exp: decoded.exp,
  };
};

export const protect = (req: Request, res: Response, next: NextFunction) => {
  const SECRET = config.ACCESS_SECRET;
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return sendError(res, API_ERROR_CODES.UNAUTHORIZED, 401);
  }

  try {
    const decoded = jwt.verify(token, SECRET);
    const payload = parseAccessPayload(decoded);

    if (!payload) {
      return sendError(res, API_ERROR_CODES.INVALID_TOKEN, 401);
    }

    req.user = payload;
    next();
  } catch {
    return sendError(res, API_ERROR_CODES.INVALID_TOKEN, 401);
  }
};

export const optionalProtect = (req: Request, _res: Response, next: NextFunction) => {
  const SECRET = config.ACCESS_SECRET;
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    next();
    return;
  }

  try {
    const decoded = jwt.verify(token, SECRET);
    req.user = parseAccessPayload(decoded);
  } catch {
    req.user = undefined;
  }

  next();
};
