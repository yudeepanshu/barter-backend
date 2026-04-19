import { z } from 'zod';
import { config } from '../../config/env';

/**
 * RFC 5321 allows email local-part up to 64 chars, domain up to 255.
 * Total max is 320. We also enforce a proper format:
 *   - At least one char before @
 *   - Domain must contain a dot
 *   - TLD must be at least 2 chars
 * This rejects obvious nonsense like "x@", "@domain.com", "foo@b".
 *
 * Why .includes('@') was wrong:
 *   Any string with @ in it would pass — e.g., "@", "@@", "not@email".
 *   An attacker could send a crafted identifier that looks like an email
 *   but fails DB lookup, then pivot on error-message differences.
 */
const emailRegex = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;
const phoneRegex = /^\d{10}$/;

const isEmailIdentifier = (value: string) => emailRegex.test(value);

// Phone OTP path is intentionally retained for future re-enable.
const isPhoneIdentifier = (value: string) => phoneRegex.test(value);

/**
 * Shared identifier validator — reused by both request-otp and verify-otp
 * to guarantee consistent rules between the two endpoints.
 */
const identifierSchema = z
  .string()
  .min(1, 'Identifier is required')
  .max(320, 'Identifier is too long')
  .refine((value) => {
    if (isEmailIdentifier(value)) {
      return true;
    }

    return config.AUTH_PHONE_OTP_ENABLED && isPhoneIdentifier(value);
  }, 'Identifier must be a valid email');

export const requestOtpSchema = z.object({
  identifier: identifierSchema,
});

export const verifyOtpSchema = z.object({
  identifier: identifierSchema,
  code: z
    .string()
    .length(6, 'OTP must be exactly 6 digits')
    .regex(/^\d+$/, 'OTP must contain only digits'),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export const googleLoginSchema = z.object({
  idToken: z.string().min(1, 'Google idToken is required'),
});

export type RequestOtpInput = z.infer<typeof requestOtpSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type GoogleLoginInput = z.infer<typeof googleLoginSchema>;
