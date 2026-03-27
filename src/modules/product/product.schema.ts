import { z } from 'zod';

export const createProductSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  categoryId: z.string().uuid().optional(),
  status: z.enum(['ACTIVE', 'RESERVED', 'EXCHANGED', 'REMOVED']).optional().default('ACTIVE'),
  requestByMoney: z.boolean().optional().default(false),
  isFree: z.boolean().optional().default(false),
  currentOwnerId: z.string().uuid().optional(),
  locationName: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  isPreOwned: z.boolean().optional().default(false),
  lifecycleVersion: z.number().int().positive().optional().default(1),
  isListed: z.boolean().optional().default(true),
});

export const uploadProductImagesSchema = z.object({
  productId: z.string().uuid(),
});

export const generatePresignedUrlsSchema = z.object({
  fileNames: z.array(z.string().min(1)).min(1).max(6),
});

export const addProductImagesSchema = z.object({
  images: z
    .array(
      z.object({
        storageKey: z.string(),
        url: z.string().url(),
        isPrimary: z.boolean().optional().default(false),
      }),
    )
    .min(1)
    .max(6),
});

export const transferOwnershipSchema = z.object({
  newOwnerId: z.string().uuid(),
});

export const queryProductsSchema = z.object({
  status: z.enum(['ACTIVE', 'RESERVED', 'EXCHANGED', 'REMOVED']).optional(),
  categoryId: z.string().uuid().optional(),
  ownerId: z.string().uuid().optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  cursor: z.string().optional(),
  locationLat: z.coerce.number().optional(),
  locationLng: z.coerce.number().optional(),
  radiusKm: z.coerce.number().min(0.1).max(100).optional(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
