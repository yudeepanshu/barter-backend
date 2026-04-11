import { Router } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import { protect } from '../../common/middlewares/auth';
import { enforceIdempotency } from '../../common/middlewares/idempotency';
import * as requestController from './request.controller';

const router = Router();

router.post('/', protect, enforceIdempotency, asyncHandler(requestController.createRequest));
router.get('/sent', protect, asyncHandler(requestController.getSentRequests));
router.get('/received', protect, asyncHandler(requestController.getReceivedRequests));
router.get('/:id/offers', protect, asyncHandler(requestController.getRequestOffers));
router.post(
  '/:id/offers',
  protect,
  enforceIdempotency,
  asyncHandler(requestController.createCounterOffer),
);
router.patch(
  '/:id/accept',
  protect,
  enforceIdempotency,
  asyncHandler(requestController.acceptRequest),
);
router.patch(
  '/:id/reject',
  protect,
  enforceIdempotency,
  asyncHandler(requestController.rejectRequest),
);
router.patch(
  '/:id/cancel',
  protect,
  enforceIdempotency,
  asyncHandler(requestController.cancelRequest),
);
router.post(
  '/:id/contact-reveal',
  protect,
  enforceIdempotency,
  asyncHandler(requestController.requestContactReveal),
);
router.post(
  '/:id/contact-reveal/:revealRequestId/respond',
  protect,
  enforceIdempotency,
  asyncHandler(requestController.respondContactReveal),
);
router.get('/:id', protect, asyncHandler(requestController.getRequestById));

export default router;
