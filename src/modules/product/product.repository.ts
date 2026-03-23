import prisma from '../../config/db';
import { CreateProductInput } from './product.schema';

export const createProduct = async (data: CreateProductInput & { currentOwnerId: string }) => {
  const createData: any = {
    title: data.title,
    description: data.description,
    status: data.status,
    requestByMoney: data.requestByMoney,
    currentOwnerId: data.currentOwnerId,
    locationName: data.locationName,
    latitude: data.latitude,
    longitude: data.longitude,
    isPreOwned: data.isPreOwned,
    lifecycleVersion: data.lifecycleVersion,
    isListed: data.isListed,
  };

  // Only include categoryId if provided
  if (data.categoryId) {
    createData.categoryId = data.categoryId;
  }

  return prisma.product.create({
    data: createData,
    include: { productImages: true, category: true },
  });
};

export const findProductById = async (id: string) => {
  return prisma.product.findUnique({
    where: { id },
    include: { productImages: true, category: true },
  });
};

export const findProducts = async (filters: {
  status?: string;
  categoryId?: string;
  ownerId?: string;
  search?: string;
}) => {
  const where: any = {};

  if (filters.status) where.status = filters.status;
  if (filters.categoryId) where.categoryId = filters.categoryId;
  if (filters.ownerId) where.currentOwnerId = filters.ownerId;

  if (filters.search) {
    where.OR = [
      { title: { contains: filters.search, mode: 'insensitive' } },
      { description: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  return prisma.product.findMany({
    where,
    include: { productImages: true, category: true },
    orderBy: { createdAt: 'desc' },
  });
};

export const addProductImages = async (
  productId: string,
  images: Array<{
    url: string;
    storageKey: string;
    isPrimary: boolean;
    width?: number;
    height?: number;
  }>,
) => {
  return prisma.$transaction(
    images.map((image) =>
      prisma.productImage.create({
        data: {
          productId,
          url: image.url,
          storageKey: image.storageKey,
          isPrimary: image.isPrimary,
          width: image.width,
          height: image.height,
        },
      }),
    ),
  );
};

export const deleteProductImageById = async (id: string) => {
  return prisma.productImage.delete({ where: { id } });
};

export const deleteProductById = async (id: string) => {
  return prisma.product.delete({ where: { id } });
};
