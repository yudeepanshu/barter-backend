import { Request, Response } from 'express';
import { sendSuccess } from '../../common/utils/responseHandler';
import { API_SUCCESS_CODES } from '../../common/constants/apiResponses';
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
  return sendSuccess(res, product, API_SUCCESS_CODES.PRODUCT_CREATED, 201);
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
  const userId = req.user!.id;
  await productService.deleteProduct(productId, userId);
  return sendSuccess(res, null, API_SUCCESS_CODES.PRODUCT_DELETED);
};

export const relistProduct = async (req: Request, res: Response) => {
  const { id: productId } = productIdParamSchema.parse(req.params);
  const userId = req.user?.id;
  const product = await productService.relistProduct(productId, userId);
  return sendSuccess(res, product, API_SUCCESS_CODES.PRODUCT_RELISTED);
};

export const updateProduct = async (req: Request, res: Response) => {
  const { id: productId } = productIdParamSchema.parse(req.params);
  const payload = updateProductSchema.parse(req.body) as UpdateProductInput;
  const userId = req.user?.id;
  const product = await productService.updateProduct(productId, payload, userId);
  return sendSuccess(res, product, API_SUCCESS_CODES.PRODUCT_UPDATED);
};

export const deleteProductImage = async (req: Request, res: Response) => {
  const imageId = req.params.imageId;
  const userId = req.user!.id;
  await productService.deleteProductImage(imageId, userId);
  return sendSuccess(res, null, API_SUCCESS_CODES.PRODUCT_IMAGE_DELETED);
};

export const markExpiredInactiveProductsAsRemoved = async (_req: Request, res: Response) => {
  const result = await productService.markExpiredInactiveProductsAsRemoved();
  return sendSuccess(res, result, API_SUCCESS_CODES.EXPIRED_INACTIVE_PRODUCTS_MARKED_AS_REMOVED);
};

export const transferProductOwnership = async (req: Request, res: Response) => {
  const productId = getProductRouteId(req);
  const { newOwnerId } = transferOwnershipSchema.parse(req.body);
  const userId = req.user!.id;
  const updatedProduct = await productService.transferProductOwnership(
    productId,
    newOwnerId,
    userId,
  );
  return sendSuccess(res, updatedProduct, API_SUCCESS_CODES.PRODUCT_OWNERSHIP_TRANSFERRED);
};

export const getProductOwnershipHistory = async (req: Request, res: Response) => {
  const productId = getProductRouteId(req);
  const history = await productService.getProductOwnershipHistory(productId);
  return sendSuccess(res, history, API_SUCCESS_CODES.PRODUCT_OWNERSHIP_HISTORY_FETCHED);
};

export const generatePresignedUrls = async (req: Request, res: Response) => {
  const productId = getProductRouteId(req);
  const { fileNames } = generatePresignedUrlsSchema.parse(req.body);
  const userId = req.user!.id;
  const urls = await productService.generatePresignedUrls(productId, fileNames, userId);
  return sendSuccess(res, urls, API_SUCCESS_CODES.PRESIGNED_URLS_GENERATED);
};

export const addProductImages = async (req: Request, res: Response) => {
  const productId = getProductRouteId(req);
  const { images } = addProductImagesSchema.parse(req.body);
  const userId = req.user!.id;
  const savedImages = await productService.addProductImagesFromUpload(productId, images, userId);
  return sendSuccess(res, savedImages, API_SUCCESS_CODES.IMAGES_ADDED_TO_PRODUCT);
};
