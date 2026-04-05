import { Router } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import * as appVersionController from './appVersion.controller';
import { adminAuth } from '../../common/middlewares/adminAuth';
import { validate } from '../../common/middlewares/validate';
import { upsertAppVersionPolicyBodySchema } from './appVersion.schema';

const router = Router();

router.get('/policy', asyncHandler(appVersionController.getVersionPolicy));
router.post(
  '/policy/upload',
  adminAuth,
  validate(upsertAppVersionPolicyBodySchema),
  asyncHandler(appVersionController.uploadVersionPolicy),
);

export default router;
