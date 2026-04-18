import path from 'path';
import { z } from 'zod';
import prisma from '../../config/db';
import { config } from '../../config/env';
import redis from '../../config/redis';
import { logger } from '../../config/logger';
import { AppError } from '../../common/errors/AppError';
import { API_ERROR_CODES } from '../../common/constants/apiResponses';
import { eventDispatcher } from '../../events/eventDispatcher';
import { S3BlobStorage } from './senders/s3Storage';
import * as repo from './product.repository';
import { CreateProductInput, UpdateProductInput, queryProductsSchema } from './product.schema';

const storage = new S3BlobStorage();
const INACTIVE_EXPIRY_DAYS = config.INACTIVE_PRODUCT_EXPIRY_DAYS;
const INACTIVE_EXPIRY_MS = INACTIVE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
const MAX_PRODUCTS_PER_USER = config.MAX_PRODUCTS_PER_USER;

const publishProductRealtimeUpdate = async (params: {
  product: {
    id: string;
    status: string;
    isListed: boolean;
    currentOwnerId?: string;
    owner?: { id: string };
  };
  action:
    | 'CREATED'
    | 'UPDATED'
    | 'RELISTED'
    | 'REMOVED'
    | 'RESERVED'
    | 'EXCHANGED'
    | 'OWNERSHIP_TRANSFERRED'
    | 'IMAGES_UPDATED';
  actorId?: string;
}) => {
  const ownerId = params.product.currentOwnerId ?? params.product.owner?.id;
  if (!ownerId) {
    return;
  }

  try {
    await eventDispatcher.publish('product.updated', {
      productId: params.product.id,
      ownerId,
      actorId: params.actorId,
      status: params.product.status,
      isListed: params.product.isListed,
      action: params.action,
    });
  } catch (error) {
    logger.warn('Failed to publish product realtime event', {
      productId: params.product.id,
      action: params.action,
      reason: error instanceof Error ? error.message : 'unknown',
    });
  }
};

export const createProduct = async (data: CreateProductInput, userId?: string) => {
  if (!userId) {
    throw new AppError(API_ERROR_CODES.UNAUTHORIZED, 401);
  }

  const userProductCount = await repo.countUserCreatableProducts(userId);
  if (userProductCount >= MAX_PRODUCTS_PER_USER) {
    throw new AppError(
      `You can create up to ${MAX_PRODUCTS_PER_USER} products only. Remove an existing listing to add a new one.`,
      409,
    );
  }

  // Validate categoryId if provided
  if (data.categoryId) {
    const category = await prisma.category.findUnique({ where: { id: data.categoryId } });
    if (!category) {
      throw new AppError(API_ERROR_CODES.CATEGORY_NOT_FOUND, 400);
    }
  }

  if (data.status === 'ACTIVE' || data.isListed === true) {
    throw new AppError(API_ERROR_CODES.PRODUCT_RELIST_REQUIRES_IMAGE, 409);
  }

  const productData = { ...data, currentOwnerId: userId } as CreateProductInput & {
    currentOwnerId: string;
  };

  const product = await repo.createProduct(productData);

  // Record initial ownership history
  await repo.createProductOwnershipHistory(product.id, userId);

  await publishProductRealtimeUpdate({
    product,
    action: 'CREATED',
    actorId: userId,
  });

  return product;
};

export const getProductById = async (productId: string) => {
  const product = await repo.findProductById(productId);
  if (!product) {
    throw new AppError(API_ERROR_CODES.PRODUCT_NOT_FOUND, 404);
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
    throw new AppError(API_ERROR_CODES.PRODUCT_TRANSFER_NOT_OWNER, 403);
  }

  if (newOwnerId === userId) {
    throw new AppError(API_ERROR_CODES.PRODUCT_SAME_OWNER, 400);
  }

  await repo.closeProductOwnershipHistory(productId);

  const updated = await prisma.product.update({
    where: { id: productId },
    data: { currentOwnerId: newOwnerId },
    include: {
      productImages: true,
      category: true,
      owner: { select: { id: true, userName: true, profilePicture: true } },
    },
  });

  await repo.createProductOwnershipHistory(productId, newOwnerId);

  await publishProductRealtimeUpdate({
    product: updated,
    action: 'OWNERSHIP_TRANSFERRED',
    actorId: userId,
  });

  return updated;
};

export const getProductOwnershipHistory = async (productId: string) => {
  await getProductById(productId); // ensure product exists
  return repo.getProductOwnershipHistory(productId);
};

type QueryProductsInput = z.infer<typeof queryProductsSchema>;

const encodeCursor = (dateValue: Date, id: string) => {
  return Buffer.from(`${dateValue.toISOString()}|${id}`, 'utf8').toString('base64');
};

const decodeCursor = (cursor: string) => {
  const decoded = Buffer.from(cursor, 'base64').toString('utf8');
  const [dateValue, id] = decoded.split('|');
  if (!dateValue || !id) {
    throw new AppError(API_ERROR_CODES.INVALID_CURSOR, 400);
  }
  return { dateValue: new Date(dateValue), id };
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
    sortBy: query.sortBy ?? 'updatedAt',
    limit: query.limit ?? 20,
    locationLat: query.locationLat ?? '',
    locationLng: query.locationLng ?? '',
    radiusKm: query.radiusKm ?? '',
  };
  return `products:${JSON.stringify(keyObj)}`;
};

export const getProducts = async (filters: QueryProductsInput, userId?: string) => {
  const limit = Math.min(filters.limit ?? 20, 100);
  const sortBy = filters.sortBy ?? 'updatedAt';

  const useCache = !filters.cursor && !userId;
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
        ? { in: ['ACTIVE', 'INACTIVE', 'RESERVED', 'EXCHANGED', 'REMOVED'] }
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
    const { dateValue, id } = decodeCursor(filters.cursor);
    cursorCondition.push({
      OR: [{ [sortBy]: { lt: dateValue } }, { [sortBy]: dateValue, id: { lt: id } }],
    });
  }

  const actualWhere = cursorCondition.length > 0 ? { AND: [where, ...cursorCondition] } : where;

  const reservationSelect = userId
    ? {
        reservations: {
          where: { status: 'ACTIVE' },
          select: { buyerId: true },
          orderBy: { createdAt: 'desc' as const },
          take: 1,
        },
      }
    : {};

  let products = await prisma.product.findMany({
    where: actualWhere,
    select: {
      id: true,
      title: true,
      description: true,
      categoryId: true,
      status: true,
      currentOwnerId: true,
      requestByMoney: true,
      minMoneyAmount: true,
      isFree: true,
      isPreOwned: true,
      lastExchangedAt: true,
      exchangeCount: true,
      locationName: true,
      latitude: true,
      longitude: true,
      isListed: true,
      createdAt: true,
      updatedAt: true,
      productImages: {
        select: {
          id: true,
          url: true,
          isPrimary: true,
          width: true,
          height: true,
        },
      },
      category: {
        select: {
          id: true,
          name: true,
          parentCategoryId: true,
        },
      },
      owner: { select: { id: true, userName: true, profilePicture: true } },
      ...reservationSelect,
    },
    orderBy: [{ [sortBy]: 'desc' }, { id: 'desc' }],
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
        return b.product[sortBy].getTime() - a.product[sortBy].getTime();
      });

    products = productsWithDistance.map((item) => item.product);
  }

  const hasMore = products.length > limit;
  if (hasMore) products = products.slice(0, limit);

  const items = products.map((product) => {
    const activeReservation = userId && 'reservations' in product ? product.reservations[0] : null;
    const inactiveRemovesAt =
      product.status === 'INACTIVE'
        ? new Date(product.updatedAt.getTime() + INACTIVE_EXPIRY_MS)
        : null;

    const reservationContext =
      product.status === 'RESERVED' && activeReservation
        ? activeReservation.buyerId === userId
          ? 'FOR_VIEWER'
          : 'OTHER_BUYER'
        : null;

    const { reservations, ...productData } = product as typeof product & {
      reservations?: Array<{ buyerId: string }>;
    };

    return {
      ...productData,
      inactiveRemovesAt,
      reservationContext,
    };
  });

  const nextCursor = hasMore
    ? encodeCursor(products[products.length - 1][sortBy], products[products.length - 1].id)
    : null;

  const response = {
    items,
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
    throw new AppError(API_ERROR_CODES.PRODUCT_DELETE_NOT_OWNER, 403);
  }

  if (product.status === 'REMOVED' && product.isListed === false) {
    throw new AppError(API_ERROR_CODES.PRODUCT_ALREADY_REMOVED, 409);
  }

  const removed = await repo.markProductAsRemoved(productId);

  await publishProductRealtimeUpdate({
    product: removed,
    action: 'REMOVED',
    actorId: userId,
  });

  return removed;
};

export const updateProduct = async (
  productId: string,
  payload: UpdateProductInput,
  userId?: string,
) => {
  if (!userId) {
    throw new AppError(API_ERROR_CODES.UNAUTHORIZED, 401);
  }

  const product = await getProductById(productId);
  if (product.currentOwnerId !== userId) {
    throw new AppError(API_ERROR_CODES.PRODUCT_UPDATE_NOT_OWNER, 403);
  }

  if (payload.categoryId) {
    const category = await prisma.category.findUnique({ where: { id: payload.categoryId } });
    if (!category) {
      throw new AppError(API_ERROR_CODES.CATEGORY_NOT_FOUND, 400);
    }
  }

  const updateData: any = {
    ...(payload.title !== undefined ? { title: payload.title } : {}),
    ...(payload.description !== undefined ? { description: payload.description } : {}),
    ...(payload.categoryId !== undefined ? { categoryId: payload.categoryId } : {}),
    ...(payload.requestByMoney !== undefined ? { requestByMoney: payload.requestByMoney } : {}),
    ...(payload.minMoneyAmount !== undefined
      ? { minMoneyAmount: payload.minMoneyAmount ?? 0 }
      : {}),
    ...(payload.locationName !== undefined ? { locationName: payload.locationName } : {}),
    ...(payload.latitude !== undefined ? { latitude: payload.latitude } : {}),
    ...(payload.longitude !== undefined ? { longitude: payload.longitude } : {}),
    ...(payload.isListed !== undefined ? { isListed: payload.isListed } : {}),
    ...(payload.isFree !== undefined ? { isFree: payload.isFree } : {}),
  };

  if (payload.isListed === false) {
    updateData.status = 'INACTIVE';
  }

  const updated = await prisma.product.update({
    where: { id: productId },
    data: updateData,
    include: {
      productImages: true,
      category: true,
      owner: { select: { id: true, userName: true, profilePicture: true } },
    },
  });

  await publishProductRealtimeUpdate({
    product: updated,
    action: 'UPDATED',
    actorId: userId,
  });

  return updated;
};

export const relistProduct = async (productId: string, userId?: string) => {
  if (!userId) {
    throw new AppError(API_ERROR_CODES.UNAUTHORIZED, 401);
  }

  const product = await getProductById(productId);
  if (product.currentOwnerId !== userId) {
    throw new AppError(API_ERROR_CODES.PRODUCT_RELIST_NOT_OWNER, 403);
  }

  const now = new Date();

  if (product.cooldownUntil && product.cooldownUntil > now) {
    throw new AppError(API_ERROR_CODES.PRODUCT_IN_COOLDOWN, 409);
  }

  if (product.isListed && product.status === 'ACTIVE') {
    throw new AppError(API_ERROR_CODES.PRODUCT_ALREADY_ACTIVE, 409);
  }

  if ((product.productImages?.length ?? 0) === 0) {
    throw new AppError(API_ERROR_CODES.PRODUCT_RELIST_REQUIRES_IMAGE, 409);
  }

  if (
    product.status !== 'EXCHANGED' &&
    product.status !== 'REMOVED' &&
    product.status !== 'INACTIVE'
  ) {
    throw new AppError(API_ERROR_CODES.PRODUCT_RELIST_INVALID_STATUS, 409);
  }

  const relisted = await prisma.product.update({
    where: { id: productId },
    data: {
      status: 'ACTIVE',
      isListed: true,
      lifecycleVersion: { increment: 1 },
      overrideCount: 0,
      lastOverrideAt: null,
      cooldownUntil: null,
    },
    include: {
      productImages: true,
      category: true,
      owner: { select: { id: true, userName: true, profilePicture: true } },
    },
  });

  await publishProductRealtimeUpdate({
    product: relisted,
    action: 'RELISTED',
    actorId: userId,
  });

  return relisted;
};

export const markExpiredInactiveProductsAsRemoved = async () => {
  const inactiveBefore = new Date(Date.now() - INACTIVE_EXPIRY_MS);
  const result = await repo.markExpiredInactiveProductsAsRemoved(inactiveBefore);

  return {
    markedRemovedCount: result.count,
    inactiveExpiryDays: INACTIVE_EXPIRY_DAYS,
    inactiveBefore,
  };
};

export const deleteProductImage = async (imageId: string, userId: string) => {
  const image = await prisma.productImage.findUnique({
    where: { id: imageId },
    include: { product: true },
  });

  if (!image) {
    throw new AppError(API_ERROR_CODES.IMAGE_NOT_FOUND, 404);
  }

  // Check if user is the product owner
  if (image.product.currentOwnerId !== userId) {
    throw new AppError(API_ERROR_CODES.PRODUCT_IMAGE_DELETE_NOT_OWNER, 403);
  }

  await storage.deleteFile(image.storageKey);

  const deleted = await repo.deleteProductImageById(imageId);

  await publishProductRealtimeUpdate({
    product: image.product,
    action: 'IMAGES_UPDATED',
    actorId: userId,
  });

  return deleted;
};

export const generatePresignedUrls = async (
  productId: string,
  fileNames: string[],
  userId: string,
) => {
  const product = await repo.findProductById(productId);
  if (!product) throw new AppError(API_ERROR_CODES.PRODUCT_NOT_FOUND, 404);

  // Check if user is the owner
  if (product.currentOwnerId !== userId) {
    throw new AppError(API_ERROR_CODES.PRODUCT_UPLOAD_NOT_OWNER, 403);
  }

  if (fileNames.length === 0 || fileNames.length > 6) {
    throw new AppError(API_ERROR_CODES.PRODUCT_FILE_COUNT_INVALID, 400);
  }

  const urls = [];
  const mimeTypeByExt: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
  };

  for (const fileName of fileNames) {
    // Validate file extension
    const ext = path.extname(fileName).toLowerCase();
    if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
      throw new AppError(API_ERROR_CODES.INVALID_FILE_TYPE, 400);
    }

    const key = `products/${productId}/${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    const {
      signedUrl,
      publicUrl,
      key: storageKey,
    } = await storage.getPresignedUrl({
      key,
      contentType: mimeTypeByExt[ext],
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
  if (!product) throw new AppError(API_ERROR_CODES.PRODUCT_NOT_FOUND, 404);

  // Check if user is the owner
  if (product.currentOwnerId !== userId) {
    throw new AppError(API_ERROR_CODES.PRODUCT_ADD_IMAGES_NOT_OWNER, 403);
  }

  if (imageData.length === 0 || imageData.length > 6) {
    throw new AppError(API_ERROR_CODES.PRODUCT_IMAGE_COUNT_INVALID, 400);
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

  await publishProductRealtimeUpdate({
    product,
    action: 'IMAGES_UPDATED',
    actorId: userId,
  });

  return savedImages;
};
