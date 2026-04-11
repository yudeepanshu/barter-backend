/**
 * Rate Limiting Middleware
 *
 * Prevents abuse by limiting requests per IP/user within a time window.
 * Uses Redis for distributed counting across multiple servers.
 *
 * Example:
 *   - Without limit: User can send 1,000 OTP attempts/second
 *   - With limit: User can send 3 OTP attempts/15 minutes
 */

import rateLimit, { ipKeyGenerator, type RateLimitInfo } from 'express-rate-limit';
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

/**
 * OTP Rate Limiter
 *
 * Most restrictive because OTP is a security-critical endpoint.
 * If someone keeps trying OTP codes, they might be attacking an account.
 *
 * Config:
 * - Window: 15 minutes
 * - Max: 3 attempts per identifier (email/phone)
 * - Key: Identifier (not IP) so multiple users from same IP aren't blocked
 *
 * Example flow:
 *   1. User tries OTP: "request-otp?identifier=user@email.com" → Count = 1
 *   2. User tries again → Count = 2
 *   3. User tries again → Count = 3 ✓ Allowed
 *   4. User tries again → Count = 4 ✗ BLOCKED (exceed limit)
 *   5. After 15 minutes → Counter resets, can try again
 */
export const otpRateLimiter = rateLimit({
  store: getRedisStore('rl:otp:'),
  windowMs: 15 * 60 * 1000, // 15 minutes in milliseconds
  max: 3, // Maximum 3 requests
  keyGenerator: (req) => {
    // Use the identifier (email/phone) from request body
    return req.body?.identifier || ipKeyGenerator(req.ip || '0.0.0.0');
  },
  message: 'Too many OTP attempts. Please wait 15 minutes before trying again.',
  standardHeaders: true, // Send RateLimit-* headers in response
  skip: () => config.NODE_ENV === 'development', // Disable in development for testing
  handler: (req, res, _next, options) => {
    const rateLimitInfo = (req as typeof req & { rateLimit?: RateLimitInfo }).rateLimit;

    logger.warn('OTP rate limit exceeded', {
      identifier: req.body?.identifier,
      ip: req.ip,
    });

    auditFromRequest(req, {
      action: 'AUTH_RATE_LIMIT_OTP',
      outcome: 'BLOCKED',
      reason: 'otp rate limit exceeded',
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
  },
});

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
