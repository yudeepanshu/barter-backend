import { Router } from 'express';
import { createUser } from './user.controller';
import { validate } from '../../common/middlewares/validate';
import { createUserSchema } from './user.schema';
import { asyncHandler } from '../../common/utils/asyncHandler';

const router = Router();

router.post('/', validate(createUserSchema), asyncHandler(createUser));

export default router;
