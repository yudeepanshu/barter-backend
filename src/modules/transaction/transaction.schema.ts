import { z } from 'zod';

export const transactionIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const verifyTransactionOtpSchema = z.object({
  otp: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'OTP must be a 6 digit code'),
});

export const getActiveTransactionQuerySchema = z
  .object({
    requestId: z.string().uuid().optional(),
    productId: z.string().uuid().optional(),
  })
  .refine((value) => !!value.requestId || !!value.productId, {
    message: 'Either requestId or productId is required',
  });

export type VerifyTransactionOtpInput = z.infer<typeof verifyTransactionOtpSchema>;
export type GetActiveTransactionQueryInput = z.infer<typeof getActiveTransactionQuerySchema>;
