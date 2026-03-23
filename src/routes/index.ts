import { Router } from 'express';
import userRoutes from '../modules/user/user.routes';
import authRoutes from '../modules/auth/auth.routes';
import productRoutes from '../modules/product/product.routes';
import categoryRoutes from '../modules/category/category.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/categories', categoryRoutes);
router.use('/products', productRoutes);

export default router;
