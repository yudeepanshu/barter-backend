import { z } from 'zod';

export const requestOtpSchema = z.object({
  identifier: z
    .string()
    .min(1, 'Identifier is required')
    .refine(
      (val) => val.includes('@') || /^\d{10}$/.test(val),
      'Identifier must be a valid email or 10-digit phone number',
    ),
});

export const verifyOtpSchema = z.object({
  identifier: z
    .string()
    .min(1, 'Identifier is required')
    .refine(
      (val) => val.includes('@') || /^\d{10}$/.test(val),
      'Identifier must be a valid email or 10-digit phone number',
    ),
  code: z
    .string()
    .length(6, 'OTP must be exactly 6 digits')
    .regex(/^\d+$/, 'OTP must contain only digits'),
});

export type RequestOtpInput = z.infer<typeof requestOtpSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
