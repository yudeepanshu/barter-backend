import { z } from 'zod';

export const createProductSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  categoryId: z.string().uuid().optional(),
  status: z.enum(['ACTIVE', 'RESERVED', 'EXCHANGED', 'REMOVED']).optional().default('ACTIVE'),
  requestByMoney: z.boolean().optional().default(false),
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

export const queryProductsSchema = z.object({
  status: z.enum(['ACTIVE', 'RESERVED', 'EXCHANGED', 'REMOVED']).optional(),
  categoryId: z.string().uuid().optional(),
  ownerId: z.string().uuid().optional(),
  search: z.string().optional(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
