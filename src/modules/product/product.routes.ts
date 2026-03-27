import { Router } from 'express';
import * as productController from './product.controller';
import { asyncHandler } from '../../common/utils/asyncHandler';
import { protect } from '../../common/middlewares/auth';

const router = Router();

// Public routes
router.get('/', asyncHandler(productController.getProducts));
router.get('/:id', asyncHandler(productController.getProduct));

// Protected routes (require authentication)
router.post('/', protect, asyncHandler(productController.createProduct));
router.patch('/:id/relist', protect, asyncHandler(productController.relistProduct));
router.delete('/:id', protect, asyncHandler(productController.deleteProduct));
router.post(
  '/:id/images/presigned',
  protect,
  asyncHandler(productController.generatePresignedUrls),
);
router.post('/:id/images', protect, asyncHandler(productController.addProductImages));
router.patch(
  '/:productId/ownership',
  protect,
  asyncHandler(productController.transferProductOwnership),
);
router.get(
  '/:productId/ownership-history',
  protect,
  asyncHandler(productController.getProductOwnershipHistory),
);
router.delete(
  '/:productId/images/:imageId',
  protect,
  asyncHandler(productController.deleteProductImage),
);

export default router;
