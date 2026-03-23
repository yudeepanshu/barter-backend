import 'multer';
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

export const uploadProductImages = async (
  productId: string,
  files: Express.Multer.File[],
  userId: string,
) => {
  const product = await repo.findProductById(productId);
  if (!product) throw new AppError('Product not found', 404);

  // Check if user is the owner
  if (product.currentOwnerId !== userId) {
    throw new AppError('You can only upload images to your own products', 403);
  }

  if (files.length === 0) {
    throw new AppError('No images uploaded', 400);
  }

  if (files.length > 6) {
    throw new AppError('You can upload maximum 6 images per request', 400);
  }

  const uploadResults: Array<{
    url: string;
    storageKey: string;
    isPrimary: boolean;
    width?: number;
    height?: number;
  }> = [];

  for (let idx = 0; idx < files.length; idx += 1) {
    const file = files[idx];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new AppError('Invalid file type. Only JPEG, PNG, WebP are allowed.', 400);
    }
    if (file.size > MAX_SIZE_BYTES) {
      throw new AppError('Each image must be smaller than 10MB', 400);
    }

    let buffer = file.buffer;

    try {
      const sharpImage = sharp(buffer).withMetadata();

      const metadata = await sharpImage.metadata();

      if (
        (metadata.width && metadata.width > 2048) ||
        (metadata.height && metadata.height > 2048) ||
        file.size > 2 * 1024 * 1024
      ) {
        buffer = await sharpImage
          .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
          .toFormat('jpeg', { quality: 80 })
          .toBuffer();
      } else {
        buffer = await sharpImage.toFormat('jpeg', { quality: 85 }).toBuffer();
      }

      const finalMeta = await sharp(buffer).metadata();
      const extension = path.extname(file.originalname).toLowerCase() || '.jpg';
      const key = `products/${productId}/${Date.now()}-${Math.random().toString(36).slice(2)}${extension}`;

      const { url, key: storageKey } = await storage.uploadFile({
        key,
        buffer,
        contentType: 'image/jpeg',
      });
      uploadResults.push({
        url,
        storageKey,
        isPrimary: idx === 0,
        width: finalMeta.width,
        height: finalMeta.height,
      });
    } catch (err) {
      throw new AppError('Failed to process image upload', 500);
    }
  }

  const savedImages = await repo.addProductImages(productId, uploadResults);

  return savedImages;
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
