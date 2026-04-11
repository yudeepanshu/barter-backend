import { Router } from 'express';

import { asyncHandler } from '../../common/utils/asyncHandler';
import { protect } from '../../common/middlewares/auth';
import { enforceIdempotency } from '../../common/middlewares/idempotency';
import * as transactionController from './transaction.controller';

const router = Router();

router.get('/active', protect, asyncHandler(transactionController.getActiveTransaction));
router.post(
  '/:id/otp',
  protect,
  enforceIdempotency,
  asyncHandler(transactionController.generateOtp),
);
router.post(
  '/:id/verify-otp',
  protect,
  enforceIdempotency,
  asyncHandler(transactionController.verifyOtp),
);

export default router;
