import sharp from 'sharp';
import path from 'path';
import prisma from '../../config/db';
import { AppError } from '../../common/errors/AppError';
import { S3BlobStorage } from './senders/s3Storage';
import * as repo from './product.repository';
import { CreateProductInput } from './product.schema';

const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB per image
const storage = new S3BlobStorage();

export const createProduct = async (data: CreateProductInput, userId?: string) => {
  if (!userId) {
    throw new AppError('Unauthorized', 401);
  }

  // Validate categoryId if provided
  if (data.categoryId) {
    const category = await prisma.category.findUnique({ where: { id: data.categoryId } });
    if (!category) {
      throw new AppError('Category not found', 400);
    }
  }

  const productData = { ...data, currentOwnerId: userId } as CreateProductInput & {
    currentOwnerId: string;
  };
  return repo.createProduct(productData);
};

export const getProductById = async (productId: string) => {
  const product = await repo.findProductById(productId);
  if (!product) {
    throw new AppError('Product not found', 404);
  }
  return product;
};

export const getProducts = async (filters: {
  status?: string;
  categoryId?: string;
  ownerId?: string;
  search?: string;
}) => {
  return repo.findProducts(filters);
};

export const deleteProduct = async (productId: string, userId: string) => {
  const product = await getProductById(productId);

  // Check if user is the owner
  if (product.currentOwnerId !== userId) {
    throw new AppError('You can only delete your own products', 403);
  }

  const images = product.productImages || [];

  for (const image of images) {
    try {
      await storage.deleteFile(image.storageKey);
    } catch (error) {
      // Log and continue; deletion should not block product deletion by default
      console.warn('Failed to delete image from storage', image.storageKey, error);
    }
  }

  return repo.deleteProductById(productId);
};

export const deleteProductImage = async (imageId: string, userId: string) => {
  const image = await prisma.productImage.findUnique({
    where: { id: imageId },
    include: { product: true },
  });

  if (!image) {
    throw new AppError('Image not found', 404);
  }

  // Check if user is the product owner
  if (image.product.currentOwnerId !== userId) {
    throw new AppError('You can only delete images from your own products', 403);
  }

  await storage.deleteFile(image.storageKey);

  return repo.deleteProductImageById(imageId);
};

export const generatePresignedUrls = async (
  productId: string,
  fileNames: string[],
  userId: string,
) => {
  const product = await repo.findProductById(productId);
  if (!product) throw new AppError('Product not found', 404);

  // Check if user is the owner
  if (product.currentOwnerId !== userId) {
    throw new AppError('You can only upload images to your own products', 403);
  }

  if (fileNames.length === 0 || fileNames.length > 6) {
    throw new AppError('You must provide 1-6 file names', 400);
  }

  const urls = [];
  for (const fileName of fileNames) {
    // Validate file extension
    const ext = path.extname(fileName).toLowerCase();
    if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
      throw new AppError('Invalid file type. Only JPEG, PNG, WebP are allowed.', 400);
    }

    const key = `products/${productId}/${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    const {
      signedUrl,
      publicUrl,
      key: storageKey,
    } = await storage.getPresignedUrl({
      key,
      contentType: `image/${ext.slice(1)}`,
    });

    urls.push({ signedUrl, publicUrl, storageKey, fileName });
  }

  return urls;
};

export const addProductImagesFromUpload = async (
  productId: string,
  imageData: Array<{ storageKey: string; url: string; isPrimary: boolean }>,
  userId: string,
) => {
  const product = await repo.findProductById(productId);
  if (!product) throw new AppError('Product not found', 404);

  // Check if user is the owner
  if (product.currentOwnerId !== userId) {
    throw new AppError('You can only add images to your own products', 403);
  }

  if (imageData.length === 0 || imageData.length > 6) {
    throw new AppError('You must provide 1-6 images', 400);
  }

  // Optionally, verify the files exist in S3, but for simplicity, assume they do

  const savedImages = await repo.addProductImages(
    productId,
    imageData.map((data) => ({
      url: data.url,
      storageKey: data.storageKey,
      isPrimary: data.isPrimary,
    })),
  );

  return savedImages;
};
