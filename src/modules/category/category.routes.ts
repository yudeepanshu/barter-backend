import { Router } from 'express';
import * as categoryController from './category.controller';
import { asyncHandler } from '../../common/utils/asyncHandler';
import { adminAuth } from '../../common/middlewares/adminAuth';
import { validate } from '../../common/middlewares/validate';
import { createCategorySchema, updateCategorySchema } from './category.schema';

const router = Router();

// Public routes
router.get('/', asyncHandler(categoryController.getCategories));
router.get('/:id', asyncHandler(categoryController.getCategory));

// Admin-only routes
router.post(
  '/',
  adminAuth,
  validate(createCategorySchema),
  asyncHandler(categoryController.createCategory),
);
router.patch(
  '/:id',
  adminAuth,
  validate(updateCategorySchema),
  asyncHandler(categoryController.updateCategory),
);
router.delete('/:id', adminAuth, asyncHandler(categoryController.deleteCategory));

export default router;
