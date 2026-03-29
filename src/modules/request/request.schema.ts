import { z } from 'zod';

export const requestStatusSchema = z.enum([
  'PENDING',
  'NEGOTIATING',
  'ACCEPTED',
  'REJECTED',
  'EXPIRED',
  'CANCELLED',
]);
export const offerTypeSchema = z.enum(['PRODUCT', 'MONEY', 'MIXED', 'NONE']);
export const contactPreferenceSchema = z.enum(['PHONE', 'EMAIL', 'BOTH']);
export const requestTurnSchema = z.enum(['BUYER', 'SELLER']);

const uuidArraySchema = z
  .array(z.string().uuid())
  .max(20)
  .optional()
  .default([])
  .transform((ids) => [...new Set(ids)]);

export const createRequestSchema = z.object({
  productId: z.string().uuid(),
  offerType: offerTypeSchema.optional().default('NONE'),
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

export const requestIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const createCounterOfferSchema = z.object({
  offerType: offerTypeSchema.optional().default('NONE'),
  offeredProducts: uuidArraySchema,
  amount: z.coerce.number().positive().optional(),
  visibleProducts: uuidArraySchema,
  message: z.string().trim().max(1000).optional(),
  expiresInHours: z.coerce
    .number()
    .int()
    .min(1)
    .max(24 * 30)
    .optional()
    .default(72),
});

export const cancelRequestSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export const requestContactRevealSchema = z.object({
  note: z.string().trim().max(500).optional(),
});

export const revealRequestIdParamSchema = z.object({
  revealRequestId: z.string().uuid(),
});

export const respondContactRevealSchema = z.object({
  approve: z.boolean(),
});

export type CreateRequestInput = z.infer<typeof createRequestSchema>;
export type ListRequestsQueryInput = z.infer<typeof listRequestsQuerySchema>;
export type CreateCounterOfferInput = z.infer<typeof createCounterOfferSchema>;
export type CancelRequestInput = z.infer<typeof cancelRequestSchema>;
export type RequestContactRevealInput = z.infer<typeof requestContactRevealSchema>;
export type RespondContactRevealInput = z.infer<typeof respondContactRevealSchema>;
