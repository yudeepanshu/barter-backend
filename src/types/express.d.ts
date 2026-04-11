import type { RateLimitInfo } from 'express-rate-limit';

type AuthenticatedUser = {
  id: string;
  iat?: number;
  exp?: number;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      rateLimit?: RateLimitInfo;
      requestId?: string;
    }
  }
}

export {};
