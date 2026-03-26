import { Router } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import { protect } from '../../common/middlewares/auth';
import * as requestController from './request.controller';

const router = Router();

router.post('/', protect, asyncHandler(requestController.createRequest));
router.get('/sent', protect, asyncHandler(requestController.getSentRequests));
router.get('/received', protect, asyncHandler(requestController.getReceivedRequests));
router.get('/:id', protect, asyncHandler(requestController.getRequestById));

export default router;
