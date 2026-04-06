import { z } from 'zod';

export const createProductSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  categoryId: z.string().uuid().optional(),
  status: z
    .enum(['ACTIVE', 'INACTIVE', 'RESERVED', 'EXCHANGED', 'REMOVED'])
    .optional()
    .default('ACTIVE'),
  requestByMoney: z.boolean().optional().default(false),
  minMoneyAmount: z.number().positive().optional(), // Minimum amount in rupees when requestByMoney is true
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

export const updateProductSchema = z
  .object({
    title: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    categoryId: z.string().uuid().nullable().optional(),
    requestByMoney: z.boolean().optional(),
    minMoneyAmount: z.number().positive().nullable().optional(), // Min amount in rupees
    locationName: z.string().nullable().optional(),
    latitude: z.number().nullable().optional(),
    longitude: z.number().nullable().optional(),
    isListed: z.boolean().optional(),
    isFree: z.boolean().optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: 'At least one field is required',
  });

export const productIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const queryProductsSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE', 'RESERVED', 'EXCHANGED', 'REMOVED']).optional(),
  categoryId: z.string().uuid().optional(),
  ownerId: z.string().uuid().optional(),
  excludeOwnerId: z.string().uuid().optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  cursor: z.string().optional(),
  locationLat: z.coerce.number().optional(),
  locationLng: z.coerce.number().optional(),
  radiusKm: z.coerce.number().min(0.1).max(100).optional(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const requestOfferMoneySchema = z.object({
  offeredAmount: z.number().positive(),
});

export type RequestOfferMoneyInput = z.infer<typeof requestOfferMoneySchema>;
