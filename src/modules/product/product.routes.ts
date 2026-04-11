import { Router } from 'express';
import * as productController from './product.controller';
import { asyncHandler } from '../../common/utils/asyncHandler';
import { optionalProtect, protect } from '../../common/middlewares/auth';
import { adminAuth } from '../../common/middlewares/adminAuth';
import { validateParams } from '../../common/middlewares/validate';
import {
  productIdParamSchema,
  productOwnershipParamSchema,
  productImageParamSchema,
} from './product.schema';

const router = Router();

// Public routes
router.get('/', optionalProtect, asyncHandler(productController.getProducts));
router.get(
  '/:id',
  validateParams(productIdParamSchema),
  asyncHandler(productController.getProduct),
);
router.post(
  '/inactive/cleanup-expired',
  adminAuth,
  asyncHandler(productController.markExpiredInactiveProductsAsRemoved),
);

// Protected routes (require authentication)
router.post('/', protect, asyncHandler(productController.createProduct));
router.patch(
  '/:id/relist',
  protect,
  validateParams(productIdParamSchema),
  asyncHandler(productController.relistProduct),
);
router.patch(
  '/:id',
  protect,
  validateParams(productIdParamSchema),
  asyncHandler(productController.updateProduct),
);
router.delete(
  '/:id',
  protect,
  validateParams(productIdParamSchema),
  asyncHandler(productController.deleteProduct),
);
router.post(
  '/:id/images/presigned',
  protect,
  validateParams(productIdParamSchema),
  asyncHandler(productController.generatePresignedUrls),
);
router.post(
  '/:id/images',
  protect,
  validateParams(productIdParamSchema),
  asyncHandler(productController.addProductImages),
);
router.patch(
  '/:productId/ownership',
  protect,
  validateParams(productOwnershipParamSchema),
  asyncHandler(productController.transferProductOwnership),
);
router.get(
  '/:productId/ownership-history',
  protect,
  validateParams(productOwnershipParamSchema),
  asyncHandler(productController.getProductOwnershipHistory),
);
router.delete(
  '/:productId/images/:imageId',
  protect,
  validateParams(productImageParamSchema),
  asyncHandler(productController.deleteProductImage),
);

export default router;
