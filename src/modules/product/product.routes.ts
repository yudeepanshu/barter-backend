import { Router } from 'express';
import multer from 'multer';
import * as productController from './product.controller';
import { asyncHandler } from '../../common/utils/asyncHandler';
import { protect } from '../../common/middlewares/auth';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Public routes
router.get('/', asyncHandler(productController.getProducts));
router.get('/:id', asyncHandler(productController.getProduct));

// Protected routes (require authentication)
router.post('/', protect, asyncHandler(productController.createProduct));
router.delete('/:id', protect, asyncHandler(productController.deleteProduct));
router.post(
  '/:id/images',
  protect,
  upload.array('images', 6),
  asyncHandler(productController.uploadProductImages),
);
router.delete(
  '/:productId/images/:imageId',
  protect,
  asyncHandler(productController.deleteProductImage),
);

export default router;
