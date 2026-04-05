import { z } from 'zod';

export const getAppVersionPolicyQuerySchema = z.object({
  platform: z.enum(['android', 'ios']).default('android'),
  channel: z.enum(['production', 'beta', 'alpha']).default('production'),
  currentVersion: z.string().trim().min(1).default('0.0.0'),
});

export type GetAppVersionPolicyQuery = z.infer<typeof getAppVersionPolicyQuerySchema>;

const platformPolicySchema = z.object({
  latestVersion: z.string().trim().min(1),
  minimumSupportedVersion: z.string().trim().min(1),
  forceUpdate: z.boolean().default(false),
  title: z.string().trim().min(1),
  message: z.string().trim().min(1),
  playStoreUrl: z.string().trim().url().optional(),
  directApkUrl: z.string().trim().url().optional(),
  appStoreUrl: z.string().trim().url().optional(),
  preferredSource: z.enum(['play-store', 'direct-apk']).optional(),
});

export const appVersionPolicySchema = z.object({
  android: platformPolicySchema,
  ios: platformPolicySchema,
});

export const upsertAppVersionPolicyBodySchema = z.union([
  appVersionPolicySchema,
  z.object({
    channels: z
      .object({
        production: appVersionPolicySchema.optional(),
        beta: appVersionPolicySchema.optional(),
        alpha: appVersionPolicySchema.optional(),
      })
      .refine(
        (value) => Boolean(value.production || value.beta || value.alpha),
        'At least one channel policy is required',
      ),
  }),
]);

export type UpsertAppVersionPolicyBody = z.infer<typeof upsertAppVersionPolicyBodySchema>;
