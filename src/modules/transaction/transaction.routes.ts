import { Router } from 'express';

import { asyncHandler } from '../../common/utils/asyncHandler';
import { protect } from '../../common/middlewares/auth';
import * as transactionController from './transaction.controller';

const router = Router();

router.get('/active', protect, asyncHandler(transactionController.getActiveTransaction));
router.post('/:id/otp', protect, asyncHandler(transactionController.generateOtp));
router.post('/:id/verify-otp', protect, asyncHandler(transactionController.verifyOtp));

export default router;
