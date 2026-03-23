import 'multer';
import { Request, Response } from 'express';
import { sendSuccess } from '../../common/utils/responseHandler';
import * as productService from './product.service';
import {
  CreateProductInput,
  createProductSchema,
  queryProductsSchema,
  uploadProductImagesSchema,
} from './product.schema';

export const createProduct = async (req: Request, res: Response) => {
  const payload = createProductSchema.parse(req.body) as CreateProductInput;
  const userId = req.user?.id;
  const product = await productService.createProduct(payload, userId);
  return sendSuccess(res, product, 'Product created', 201);
};

export const getProducts = async (req: Request, res: Response) => {
  const query = queryProductsSchema.parse(req.query);
  const products = await productService.getProducts(query);
  return sendSuccess(res, products);
};

export const getProduct = async (req: Request, res: Response) => {
  const productId = req.params.id;
  const product = await productService.getProductById(productId);
  return sendSuccess(res, product);
};

export const deleteProduct = async (req: Request, res: Response) => {
  const productId = req.params.id;
  const userId = req.user?.id;
  await productService.deleteProduct(productId, userId);
  return sendSuccess(res, null, 'Product deleted');
};

export const uploadProductImages = async (req: Request, res: Response) => {
  const { productId } = uploadProductImagesSchema.parse({ productId: req.params.id });
  const userId = req.user?.id;
  const files = (req.files as Express.Multer.File[]) || [];
  const uploaded = await productService.uploadProductImages(productId, files, userId);

  return sendSuccess(res, uploaded, 'Images uploaded', 201);
};

export const deleteProductImage = async (req: Request, res: Response) => {
  const imageId = req.params.imageId;
  const userId = req.user?.id;
  await productService.deleteProductImage(imageId, userId);
  return sendSuccess(res, null, 'Product image deleted');
};
