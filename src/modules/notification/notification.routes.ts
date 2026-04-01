import { Router } from 'express';
import { protect } from '../../common/middlewares/auth';
import { asyncHandler } from '../../common/utils/asyncHandler';
import * as notificationController from './notification.controller';

const router = Router();

router.get('/', protect, asyncHandler(notificationController.getNotifications));
router.post('/devices', protect, asyncHandler(notificationController.registerPushDevice));
router.post(
  '/devices/unregister',
  protect,
  asyncHandler(notificationController.unregisterPushDevice),
);
router.post('/read-all', protect, asyncHandler(notificationController.markAllNotificationsRead));
router.post('/:id/read', protect, asyncHandler(notificationController.markNotificationRead));

export default router;
