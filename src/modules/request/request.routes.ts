import { Router } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import { protect } from '../../common/middlewares/auth';
import * as requestController from './request.controller';

const router = Router();

router.post('/', protect, asyncHandler(requestController.createRequest));
router.get('/sent', protect, asyncHandler(requestController.getSentRequests));
router.get('/received', protect, asyncHandler(requestController.getReceivedRequests));
router.get('/:id/offers', protect, asyncHandler(requestController.getRequestOffers));
router.post('/:id/offers', protect, asyncHandler(requestController.createCounterOffer));
router.patch('/:id/accept', protect, asyncHandler(requestController.acceptRequest));
router.patch('/:id/reject', protect, asyncHandler(requestController.rejectRequest));
router.patch('/:id/cancel', protect, asyncHandler(requestController.cancelRequest));
router.get('/:id', protect, asyncHandler(requestController.getRequestById));

export default router;
