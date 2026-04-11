import { z } from 'zod';

export const createProductSchema = z.object({
  // Max 150 chars: long titles get truncated in UI anyway and a huge title
  // could be used to bloat DB rows or search indices.
  title: z.string().min(1).max(150),
  // Max 5000 chars: enough for a detailed description; above that it's abuse.
  description: z.string().max(5000).optional(),
  categoryId: z.string().uuid().optional(),
  status: z
    .enum(['ACTIVE', 'INACTIVE', 'RESERVED', 'EXCHANGED', 'REMOVED'])
    .optional()
    .default('ACTIVE'),
  requestByMoney: z.boolean().optional().default(false),
  minMoneyAmount: z.number().positive().optional(), // Minimum amount in rupees when requestByMoney is true
  isFree: z.boolean().optional().default(false),
  currentOwnerId: z.string().uuid().optional(),
  // Max 200 chars: covers any real place name; longer = likely garbage data.
  locationName: z.string().max(200).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  isPreOwned: z.boolean().optional().default(false),
  lifecycleVersion: z.number().int().positive().optional().default(1),
  isListed: z.boolean().optional().default(true),
});

export const uploadProductImagesSchema = z.object({
  productId: z.string().uuid(),
});

export const generatePresignedUrlsSchema = z.object({
  // Each filename max 255 chars (OS filesystem limit).
  // Without this an attacker could send a 10KB fake filename string.
  fileNames: z.array(z.string().min(1).max(255)).min(1).max(6),
});

export const addProductImagesSchema = z.object({
  images: z
    .array(
      z.object({
        // storageKey is an S3 object key — 500 chars covers any real key.
        storageKey: z.string().min(1).max(500),
        // URLs should fit within typical browser/CDN limits (2048 chars).
        url: z.string().url().max(2048),
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
    title: z.string().min(1).max(150).optional(),
    description: z.string().max(5000).nullable().optional(),
    categoryId: z.string().uuid().nullable().optional(),
    requestByMoney: z.boolean().optional(),
    minMoneyAmount: z.number().positive().nullable().optional(), // Min amount in rupees
    locationName: z.string().max(200).nullable().optional(),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    isListed: z.boolean().optional(),
    isFree: z.boolean().optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: 'At least one field is required',
  });

export const queryProductsSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE', 'RESERVED', 'EXCHANGED', 'REMOVED']).optional(),
  categoryId: z.string().uuid().optional(),
  ownerId: z.string().uuid().optional(),
  excludeOwnerId: z.string().uuid().optional(),
  // Cap search query to prevent expensive LIKE '%...%' with huge strings.
  search: z.string().max(200).optional(),
  sortBy: z.enum(['updatedAt', 'createdAt']).optional().default('updatedAt'),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  // Cursor is a base64-encoded ID — 200 chars is more than enough.
  cursor: z.string().max(200).optional(),
  locationLat: z.coerce.number().min(-90).max(90).optional(),
  locationLng: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().min(0.1).max(100).optional(),
});

/**
 * URL parameter schemas — used with validateParams() in route files.
 * Centralised here so every route using the same param shape reuses
 * the same rule (UUID format enforcement).
 */
export const productIdParamSchema = z.object({
  id: z.string().uuid(),
});

/** For routes like PATCH /:productId/ownership and GET /:productId/ownership-history */
export const productOwnershipParamSchema = z.object({
  productId: z.string().uuid(),
});

/** For routes like DELETE /:productId/images/:imageId */
export const productImageParamSchema = z.object({
  productId: z.string().uuid(),
  imageId: z.string().uuid(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const requestOfferMoneySchema = z.object({
  offeredAmount: z.number().positive(),
});

export type RequestOfferMoneyInput = z.infer<typeof requestOfferMoneySchema>;
