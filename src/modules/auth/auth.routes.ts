import { Router } from 'express';
import { logout, refreshToken, requestOtp, verifyOtp } from './auth.controller';
import { asyncHandler } from '../../common/utils/asyncHandler';
import { validate } from '../../common/middlewares/validate';
import {
  refreshTokenSchema,
  requestOtpSchema,
  verifyOtpSchema,
} from '../../common/validators/auth';
import {
  otpRequestRateLimiter,
  otpVerifyRateLimiter,
  refreshTokenLimiter,
} from '../../common/middlewares/rateLimiter';

const router = Router();

// ============================================================
// OTP ENDPOINTS - Most Security-Critical
// ============================================================
// 🔒 Apply OTP route limiters
// WHY: Someone trying OTP codes repeatedly might be attacking an account
//
// Example: Brute force attack without protection
//   Attacker tries all 1,000,000 combinations of 6-digit codes
//   With our route limits:
//   - request-otp: 6 / 15 min
//   - verify-otp: 12 / 15 min
//   (env-configurable)
//
router.post(
  '/request-otp',
  otpRequestRateLimiter,
  validate(requestOtpSchema),
  asyncHandler(requestOtp),
);

router.post(
  '/verify-otp',
  otpVerifyRateLimiter,
  validate(verifyOtpSchema),
  asyncHandler(verifyOtp),
);

// ============================================================
// REFRESH TOKEN ENDPOINT
// ============================================================
// 🔒 Apply moderate rate limiter (10 per hour)
// WHY: Requires valid authentication already
//      Less likely to be abused than unauthenticated endpoints
//
router.post(
  '/refresh-token',
  refreshTokenLimiter,
  validate(refreshTokenSchema),
  asyncHandler(refreshToken),
);

router.post('/logout', refreshTokenLimiter, validate(refreshTokenSchema), asyncHandler(logout));

export default router;
