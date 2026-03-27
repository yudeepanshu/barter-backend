import { Router } from 'express';
import userRoutes from '../modules/user/user.routes';
import authRoutes from '../modules/auth/auth.routes';
import productRoutes from '../modules/product/product.routes';
import categoryRoutes from '../modules/category/category.routes';
import requestRoutes from '../modules/request/request.routes';
import transactionRoutes from '../modules/transaction/transaction.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/categories', categoryRoutes);
router.use('/products', productRoutes);
router.use('/requests', requestRoutes);
router.use('/transactions', transactionRoutes);

export default router;
