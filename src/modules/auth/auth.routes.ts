import { Router } from 'express';
import { requestOtp, verifyOtp } from './auth.controller';
import { asyncHandler } from '../../common/utils/asyncHandler';
import { validate } from '../../common/middlewares/validate';
import { requestOtpSchema, verifyOtpSchema } from '../../common/validators/auth';

const router = Router();

router.post('/request-otp', validate(requestOtpSchema), asyncHandler(requestOtp));
router.post('/verify-otp', validate(verifyOtpSchema), asyncHandler(verifyOtp));

export default router;
