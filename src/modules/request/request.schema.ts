import { z } from 'zod';

export const requestStatusSchema = z.enum(['PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED']);
export const offerTypeSchema = z.enum(['PRODUCT', 'MONEY', 'MIXED']);
export const contactPreferenceSchema = z.enum(['PHONE', 'EMAIL', 'BOTH']);

const uuidArraySchema = z
  .array(z.string().uuid())
  .max(20)
  .optional()
  .default([])
  .transform((ids) => [...new Set(ids)]);

export const createRequestSchema = z.object({
  productId: z.string().uuid(),
  offerType: offerTypeSchema,
  offeredProducts: uuidArraySchema,
  amount: z.coerce.number().positive().optional(),
  visibleProducts: uuidArraySchema,
  allowProductAccess: z.boolean().optional().default(false),
  message: z.string().trim().max(1000).optional(),
  contactPreference: contactPreferenceSchema.optional().default('PHONE'),
  expiresInHours: z.coerce
    .number()
    .int()
    .min(1)
    .max(24 * 30)
    .optional()
    .default(72),
});

export const listRequestsQuerySchema = z.object({
  status: requestStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  cursor: z.string().optional(),
});

export type CreateRequestInput = z.infer<typeof createRequestSchema>;
export type ListRequestsQueryInput = z.infer<typeof listRequestsQuerySchema>;
