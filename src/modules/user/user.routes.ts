import { Router } from 'express';
import { createUser, getMe } from './user.controller';
import { validate } from '../../common/middlewares/validate';
import { createUserSchema } from './user.schema';
import { asyncHandler } from '../../common/utils/asyncHandler';
import { protect } from '../../common/middlewares/auth';

const router = Router();

router.get('/me', protect, asyncHandler(getMe));
router.post('/', validate(createUserSchema), asyncHandler(createUser));

export default router;
