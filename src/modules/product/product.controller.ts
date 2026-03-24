import { Request, Response } from 'express';
import { sendSuccess } from '../../common/utils/responseHandler';
import * as productService from './product.service';
import {
  CreateProductInput,
  createProductSchema,
  queryProductsSchema,
  generatePresignedUrlsSchema,
  addProductImagesSchema,
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

export const deleteProductImage = async (req: Request, res: Response) => {
  const imageId = req.params.imageId;
  const userId = req.user?.id;
  await productService.deleteProductImage(imageId, userId);
  return sendSuccess(res, null, 'Product image deleted');
};
export const generatePresignedUrls = async (req: Request, res: Response) => {
  const { productId } = req.params;
  const { fileNames } = generatePresignedUrlsSchema.parse(req.body);
  const userId = req.user?.id;
  const urls = await productService.generatePresignedUrls(productId, fileNames, userId);
  return sendSuccess(res, urls, 'Pre-signed URLs generated');
};

export const addProductImages = async (req: Request, res: Response) => {
  const { productId } = req.params;
  const { images } = addProductImagesSchema.parse(req.body);
  const userId = req.user?.id;
  const savedImages = await productService.addProductImagesFromUpload(productId, images, userId);
  return sendSuccess(res, savedImages, 'Images added to product');
};
