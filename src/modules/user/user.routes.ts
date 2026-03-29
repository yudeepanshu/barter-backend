import { Router } from 'express';
import { createUser, generateProfilePicturePresigned, getMe, updateMe } from './user.controller';
import { validate } from '../../common/middlewares/validate';
import { createUserSchema, updateUserProfileSchema } from './user.schema';
import { asyncHandler } from '../../common/utils/asyncHandler';
import { protect } from '../../common/middlewares/auth';

const router = Router();

router.get('/me', protect, asyncHandler(getMe));
router.patch('/me', protect, validate(updateUserProfileSchema), asyncHandler(updateMe));
router.post(
  '/me/profile-picture/presigned',
  protect,
  asyncHandler(generateProfilePicturePresigned),
);
router.post('/', validate(createUserSchema), asyncHandler(createUser));

export default router;
