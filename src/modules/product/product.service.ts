import path from 'path';
import { z } from 'zod';
import prisma from '../../config/db';
import { config } from '../../config/env';
import redis from '../../config/redis';
import { AppError } from '../../common/errors/AppError';
import { S3BlobStorage } from './senders/s3Storage';
import * as repo from './product.repository';
import { CreateProductInput, UpdateProductInput, queryProductsSchema } from './product.schema';

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

  const product = await repo.createProduct(productData);

  // Record initial ownership history
  await repo.createProductOwnershipHistory(product.id, userId);

  return product;
};

export const getProductById = async (productId: string) => {
  const product = await repo.findProductById(productId);
  if (!product) {
    throw new AppError('Product not found', 404);
  }
  return product;
};

export const transferProductOwnership = async (
  productId: string,
  newOwnerId: string,
  userId: string,
) => {
  const product = await getProductById(productId);
  if (product.currentOwnerId !== userId) {
    throw new AppError('You can only transfer your own product', 403);
  }

  if (newOwnerId === userId) {
    throw new AppError('New owner must be different from current owner', 400);
  }

  await repo.closeProductOwnershipHistory(productId);

  const updated = await prisma.product.update({
    where: { id: productId },
    data: { currentOwnerId: newOwnerId },
    include: { productImages: true, category: true },
  });

  await repo.createProductOwnershipHistory(productId, newOwnerId);

  return updated;
};

export const getProductOwnershipHistory = async (productId: string) => {
  await getProductById(productId); // ensure product exists
  return repo.getProductOwnershipHistory(productId);
};

type QueryProductsInput = z.infer<typeof queryProductsSchema>;

const encodeCursor = (createdAt: Date, id: string) => {
  return Buffer.from(`${createdAt.toISOString()}|${id}`, 'utf8').toString('base64');
};

const decodeCursor = (cursor: string) => {
  const decoded = Buffer.from(cursor, 'base64').toString('utf8');
  const [createdAt, id] = decoded.split('|');
  if (!createdAt || !id) {
    throw new AppError('Invalid cursor', 400);
  }
  return { createdAt: new Date(createdAt), id };
};

const distanceKm = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371; // earth radius km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const getCacheKey = (query: QueryProductsInput) => {
  const keyObj = {
    status: query.status ?? 'ACTIVE,RESERVED',
    categoryId: query.categoryId ?? '',
    ownerId: query.ownerId ?? '',
    excludeOwnerId: query.excludeOwnerId ?? '',
    search: query.search ?? '',
    limit: query.limit ?? 20,
    locationLat: query.locationLat ?? '',
    locationLng: query.locationLng ?? '',
    radiusKm: query.radiusKm ?? '',
  };
  return `products:${JSON.stringify(keyObj)}`;
};

export const getProducts = async (filters: QueryProductsInput) => {
  const limit = Math.min(filters.limit ?? 20, 100);

  const useCache = !filters.cursor;
  const cacheKey = useCache ? getCacheKey(filters) : null;

  if (useCache && cacheKey) {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
  }

  const isOwnerQuery = Boolean(filters.ownerId);

  const where: any = {
    status: filters.status
      ? filters.status
      : isOwnerQuery
        ? { in: ['ACTIVE', 'RESERVED', 'EXCHANGED', 'REMOVED'] }
        : { in: ['ACTIVE', 'RESERVED'] },
    ...(isOwnerQuery ? {} : { isListed: true }),
  };

  if (filters.categoryId) where.categoryId = filters.categoryId;
  if (filters.ownerId) where.currentOwnerId = filters.ownerId;
  if (!filters.ownerId && filters.excludeOwnerId) {
    where.currentOwnerId = { not: filters.excludeOwnerId };
  }

  if (filters.search) {
    where.OR = [
      { title: { contains: filters.search, mode: 'insensitive' } },
      { description: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  let locationFilter = null;
  if (filters.locationLat != null && filters.locationLng != null && filters.radiusKm != null) {
    const lat = filters.locationLat;
    const lng = filters.locationLng;
    const radiusKm = filters.radiusKm;
    const latDelta = radiusKm / 111.32;
    const lngDelta = radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180));

    locationFilter = {
      latitude: { gte: lat - latDelta, lte: lat + latDelta },
      longitude: { gte: lng - lngDelta, lte: lng + lngDelta },
    };

    Object.assign(where, locationFilter);
  }

  const cursorCondition: any[] = [];
  if (filters.cursor) {
    const { createdAt, id } = decodeCursor(filters.cursor);
    cursorCondition.push({
      OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: id } }],
    });
  }

  const actualWhere = cursorCondition.length > 0 ? { AND: [where, ...cursorCondition] } : where;

  let products = await prisma.product.findMany({
    where: actualWhere,
    include: { productImages: true, category: true },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
  });

  if (locationFilter) {
    const productsWithDistance = products
      .filter((product) => product.latitude != null && product.longitude != null)
      .map((product) => ({
        product,
        dist: distanceKm(
          filters.locationLat!,
          filters.locationLng!,
          product.latitude!,
          product.longitude!,
        ),
      }))
      .sort((a, b) => {
        if (a.dist !== b.dist) return a.dist - b.dist;
        return b.product.createdAt.getTime() - a.product.createdAt.getTime();
      });

    products = productsWithDistance.map((item) => item.product);
  }

  const hasMore = products.length > limit;
  if (hasMore) products = products.slice(0, limit);

  const nextCursor = hasMore
    ? encodeCursor(products[products.length - 1].createdAt, products[products.length - 1].id)
    : null;

  const response = {
    items: products,
    nextCursor,
    hasMore,
  };

  if (useCache && cacheKey) {
    await redis.set(
      cacheKey,
      JSON.stringify(response),
      'EX',
      config.PRODUCT_DISCOVERY_CACHE_TTL_SECONDS,
    );
  }

  return response;
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

export const updateProduct = async (
  productId: string,
  payload: UpdateProductInput,
  userId?: string,
) => {
  if (!userId) {
    throw new AppError('Unauthorized', 401);
  }

  const product = await getProductById(productId);
  if (product.currentOwnerId !== userId) {
    throw new AppError('You can only update your own product', 403);
  }

  if (payload.categoryId) {
    const category = await prisma.category.findUnique({ where: { id: payload.categoryId } });
    if (!category) {
      throw new AppError('Category not found', 400);
    }
  }

  const updateData: any = {
    ...(payload.title !== undefined ? { title: payload.title } : {}),
    ...(payload.description !== undefined ? { description: payload.description } : {}),
    ...(payload.categoryId !== undefined ? { categoryId: payload.categoryId } : {}),
    ...(payload.requestByMoney !== undefined ? { requestByMoney: payload.requestByMoney } : {}),
    ...(payload.locationName !== undefined ? { locationName: payload.locationName } : {}),
    ...(payload.latitude !== undefined ? { latitude: payload.latitude } : {}),
    ...(payload.longitude !== undefined ? { longitude: payload.longitude } : {}),
    ...(payload.isListed !== undefined ? { isListed: payload.isListed } : {}),
    ...(payload.isFree !== undefined ? { isFree: payload.isFree } : {}),
  };

  return prisma.product.update({
    where: { id: productId },
    data: updateData,
    include: { productImages: true, category: true },
  });
};

export const relistProduct = async (productId: string, userId?: string) => {
  if (!userId) {
    throw new AppError('Unauthorized', 401);
  }

  const product = await getProductById(productId);
  if (product.currentOwnerId !== userId) {
    throw new AppError('You can only relist your own product', 403);
  }

  const now = new Date();

  if (product.cooldownUntil && product.cooldownUntil > now) {
    throw new AppError('Product is still in cooldown', 409);
  }

  if (product.isListed && product.status === 'ACTIVE') {
    throw new AppError('Product is already active', 409);
  }

  if (product.status !== 'EXCHANGED' && product.status !== 'REMOVED') {
    throw new AppError('Only exchanged or removed products can be relisted', 409);
  }

  return prisma.product.update({
    where: { id: productId },
    data: {
      status: 'ACTIVE',
      isListed: true,
      lifecycleVersion: { increment: 1 },
      overrideCount: 0,
      lastOverrideAt: null,
      cooldownUntil: null,
    },
    include: { productImages: true, category: true },
  });
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
