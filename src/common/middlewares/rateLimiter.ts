/**
 * Rate Limiting Middleware
 *
 * Prevents abuse by limiting requests per IP/user within a time window.
 * Uses Redis for distributed counting across multiple servers.
 *
 * Example:
 *   - Without limit: User can send 1,000 OTP attempts/second
 *   - With limit: User can request 6 OTPs/15 minutes and verify up to 12/15 minutes
 */

import rateLimit, { ipKeyGenerator, type RateLimitInfo } from 'express-rate-limit';
import type { NextFunction, Request, Response } from 'express';
import RedisStore from 'rate-limit-redis';
import redis from '../../config/redis';
import { logger } from '../../config/logger';
import { config } from '../../config/env';
import { auditFromRequest } from '../services/auditLogger';

// What goes into the rate limit key? Usually IP address or user ID
// This determines WHO is being rate limited
const getRedisStore = (prefix: string) =>
  new RedisStore({
    sendCommand: (...args: string[]) => redis.call(args[0], ...args.slice(1)) as any,
    prefix, // E.g., "rl:otp:" means Redis keys like "rl:otp:user@email.com"
  });

const otpRateLimitWindowMs = config.OTP_ROUTE_WINDOW_SECONDS * 1000;

const otpIdentifierKeyGenerator = (req: Request) =>
  req.body?.identifier || ipKeyGenerator(req.ip || '0.0.0.0');

const otpRateLimitHandler =
  (reason: string) =>
  (req: Request, res: Response, _next: NextFunction, options: { message?: unknown }) => {
    const rateLimitInfo = (req as typeof req & { rateLimit?: RateLimitInfo }).rateLimit;

    logger.warn('OTP rate limit exceeded', {
      identifier: req.body?.identifier,
      ip: req.ip,
      reason,
    });

    auditFromRequest(req, {
      action: 'AUTH_RATE_LIMIT_OTP',
      outcome: 'BLOCKED',
      reason,
      details: {
        identifierType:
          typeof req.body?.identifier === 'string' && req.body.identifier.includes('@')
            ? 'email'
            : 'phone',
        retryAfter: rateLimitInfo?.resetTime,
      },
    });

    res.status(429).json({
      success: false,
      code: 'RATE_LIMIT_EXCEEDED',
      message: options.message,
      retryAfter: rateLimitInfo?.resetTime,
    });
  };

/**
 * OTP request limiter (send/resend)
 * Default: 6 requests per 15 minutes per identifier.
 */
export const otpRequestRateLimiter = rateLimit({
  store: getRedisStore('rl:otp:request:'),
  windowMs: otpRateLimitWindowMs,
  max: config.OTP_REQUEST_ROUTE_MAX_REQUESTS,
  keyGenerator: otpIdentifierKeyGenerator,
  message: 'Too many OTP requests. Please wait before requesting again.',
  standardHeaders: true,
  skip: () => config.NODE_ENV === 'development',
  handler: otpRateLimitHandler('otp request route rate limit exceeded'),
});

/**
 * OTP verify limiter
 * Default: 12 verification attempts per 15 minutes per identifier.
 */
export const otpVerifyRateLimiter = rateLimit({
  store: getRedisStore('rl:otp:verify:'),
  windowMs: otpRateLimitWindowMs,
  max: config.OTP_VERIFY_ROUTE_MAX_REQUESTS,
  keyGenerator: otpIdentifierKeyGenerator,
  message: 'Too many OTP verification attempts. Please wait before trying again.',
  standardHeaders: true,
  skip: () => config.NODE_ENV === 'development',
  handler: otpRateLimitHandler('otp verify route rate limit exceeded'),
});

// Backward-compatible alias for any existing imports.
export const otpRateLimiter = otpRequestRateLimiter;

/**
 * Refresh Token Rate Limiter
 *
 * Prevents token refresh spam. If someone has a valid token and keeps
 * refresh-token endpoint, they might be testing for vulnerabilities.
 *
 * Less strict than OTP (10 per hour vs 3 per 15 min) because this
 * requires authentication already.
 */
export const refreshTokenLimiter = rateLimit({
  store: getRedisStore('rl:refresh:'),
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  keyGenerator: (req) => req.user?.id || ipKeyGenerator(req.ip || '0.0.0.0'),
  skip: () => config.NODE_ENV === 'development',
});

/**
 * Google login limiter
 *
 * Google sign-in can be retried several times during setup/debugging.
 * Keep this separate from refresh-token limiter to avoid premature 429s.
 */
export const googleAuthLimiter = rateLimit({
  store: getRedisStore('rl:auth:google:'),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,
  keyGenerator: (req) => ipKeyGenerator(req.ip || '0.0.0.0'),
  skip: () => config.NODE_ENV === 'development',
  standardHeaders: true,
});

/**
 * General API Rate Limiter
 *
 * Applied globally to all routes. Prevents basic DoS attacks.
 *
 * Config:
 * - Per IP (not authenticated users)
 * - 100 requests per minute is reasonable for:
 *   - Mobile app doing background sync
 *   - Web app with multiple tabs
 *   - Legitimate heavy users
 *
 * Not per-user because then you'd need to authenticate first,
 * and attackers could just use new accounts.
 */
export const apiLimiter = rateLimit({
  store: getRedisStore('rl:api:'),
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute per IP
  keyGenerator: (req) => ipKeyGenerator(req.ip || '0.0.0.0'),
  skip: () => config.NODE_ENV === 'development',
  standardHeaders: true,
});

/**
 * Authenticated API Rate Limiter
 *
 * After user is logged in, track by user ID instead of IP.
 * A single user should NOT make 100 requests/minute.
 *
 * Use for: Creating products, sending requests, etc.
 */
export const authenticatedApiLimiter = rateLimit({
  store: getRedisStore('rl:authenticated:'),
  windowMs: 1 * 60 * 1000,
  max: 30, // Stricter: 30 per minute for logged-in users
  keyGenerator: (req) => req.user?.id || ipKeyGenerator(req.ip || '0.0.0.0'),
  skip: (req) => {
    // Skip rate limiting if not authenticated
    // (fall back to general limiter instead)
    return !req.user?.id;
  },
});

/**
 * Strict Rate Limiter for sensitive operations
 *
 * Use for: Payments, account deletion, security-critical actions
 *
 * Very strict: Only 5 per minute per user
 */
export const strictLimiter = rateLimit({
  store: getRedisStore('rl:strict:'),
  windowMs: 1 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => req.user?.id || ipKeyGenerator(req.ip || '0.0.0.0'),
  skip: () => config.NODE_ENV === 'development',
});

logger.info('Rate limiters initialized', {
  environment: config.NODE_ENV,
  redisPrefix: 'rl:*',
  note: 'Configured but disabled in development for testing',
});
