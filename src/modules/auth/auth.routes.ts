import { Router } from 'express';
import { refreshToken, requestOtp, verifyOtp } from './auth.controller';
import { asyncHandler } from '../../common/utils/asyncHandler';
import { validate } from '../../common/middlewares/validate';
import {
  refreshTokenSchema,
  requestOtpSchema,
  verifyOtpSchema,
} from '../../common/validators/auth';

const router = Router();

router.post('/request-otp', validate(requestOtpSchema), asyncHandler(requestOtp));
router.post('/verify-otp', validate(verifyOtpSchema), asyncHandler(verifyOtp));
router.post('/refresh-token', validate(refreshTokenSchema), asyncHandler(refreshToken));

export default router;
