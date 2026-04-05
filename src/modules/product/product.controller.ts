import { Request, Response } from 'express';
import { sendSuccess } from '../../common/utils/responseHandler';
import * as productService from './product.service';
import {
  CreateProductInput,
  UpdateProductInput,
  createProductSchema,
  addProductImagesSchema,
  generatePresignedUrlsSchema,
  productIdParamSchema,
  queryProductsSchema,
  transferOwnershipSchema,
  updateProductSchema,
} from './product.schema';

const getProductRouteId = (req: Request) => req.params.id || req.params.productId;

export const createProduct = async (req: Request, res: Response) => {
  const payload = createProductSchema.parse(req.body) as CreateProductInput;
  const userId = req.user?.id;
  const product = await productService.createProduct(payload, userId);
  return sendSuccess(res, product, 'Product created', 201);
};

export const getProducts = async (req: Request, res: Response) => {
  const query = queryProductsSchema.parse(req.query);
  const userId = req.user?.id;
  const products = await productService.getProducts(query, userId);
  return sendSuccess(res, products);
};

export const getProduct = async (req: Request, res: Response) => {
  const { id: productId } = productIdParamSchema.parse(req.params);
  const product = await productService.getProductById(productId);
  return sendSuccess(res, product);
};

export const deleteProduct = async (req: Request, res: Response) => {
  const { id: productId } = productIdParamSchema.parse(req.params);
  const userId = req.user?.id;
  await productService.deleteProduct(productId, userId);
  return sendSuccess(res, null, 'Product deleted');
};

export const relistProduct = async (req: Request, res: Response) => {
  const { id: productId } = productIdParamSchema.parse(req.params);
  const userId = req.user?.id;
  const product = await productService.relistProduct(productId, userId);
  return sendSuccess(res, product, 'Product relisted');
};

export const updateProduct = async (req: Request, res: Response) => {
  const { id: productId } = productIdParamSchema.parse(req.params);
  const payload = updateProductSchema.parse(req.body) as UpdateProductInput;
  const userId = req.user?.id;
  const product = await productService.updateProduct(productId, payload, userId);
  return sendSuccess(res, product, 'Product updated');
};

export const deleteProductImage = async (req: Request, res: Response) => {
  const imageId = req.params.imageId;
  const userId = req.user?.id;
  await productService.deleteProductImage(imageId, userId);
  return sendSuccess(res, null, 'Product image deleted');
};

export const markExpiredInactiveProductsAsRemoved = async (_req: Request, res: Response) => {
  const result = await productService.markExpiredInactiveProductsAsRemoved();
  return sendSuccess(res, result, 'Expired inactive products marked as removed');
};

export const transferProductOwnership = async (req: Request, res: Response) => {
  const productId = getProductRouteId(req);
  const { newOwnerId } = transferOwnershipSchema.parse(req.body);
  const userId = req.user?.id;
  const updatedProduct = await productService.transferProductOwnership(
    productId,
    newOwnerId,
    userId,
  );
  return sendSuccess(res, updatedProduct, 'Product ownership transferred');
};

export const getProductOwnershipHistory = async (req: Request, res: Response) => {
  const productId = getProductRouteId(req);
  const history = await productService.getProductOwnershipHistory(productId);
  return sendSuccess(res, history, 'Product ownership history');
};

export const generatePresignedUrls = async (req: Request, res: Response) => {
  const productId = getProductRouteId(req);
  const { fileNames } = generatePresignedUrlsSchema.parse(req.body);
  const userId = req.user?.id;
  const urls = await productService.generatePresignedUrls(productId, fileNames, userId);
  return sendSuccess(res, urls, 'Pre-signed URLs generated');
};

export const addProductImages = async (req: Request, res: Response) => {
  const productId = getProductRouteId(req);
  const { images } = addProductImagesSchema.parse(req.body);
  const userId = req.user?.id;
  const savedImages = await productService.addProductImagesFromUpload(productId, images, userId);
  return sendSuccess(res, savedImages, 'Images added to product');
};
