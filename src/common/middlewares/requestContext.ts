import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

const REQUEST_ID_HEADER = 'x-request-id';

const sanitizeRequestId = (value: string) => {
  return value.replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 128);
};

const generateRequestId = () => {
  const random = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random()}`;
  return `req_${random}`;
};

export const requestContext = (req: Request, res: Response, next: NextFunction) => {
  const incoming = req.header(REQUEST_ID_HEADER);
  const requestId = incoming
    ? sanitizeRequestId(incoming) || generateRequestId()
    : generateRequestId();

  req.requestId = requestId;
  res.locals.requestId = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);

  next();
};
