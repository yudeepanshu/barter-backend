import { z } from 'zod';

export const getAppVersionPolicyQuerySchema = z.object({
  platform: z.enum(['android', 'ios']).default('android'),
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

export const upsertAppVersionPolicyBodySchema = z.object({
  android: platformPolicySchema,
  ios: platformPolicySchema,
});

export type UpsertAppVersionPolicyBody = z.infer<typeof upsertAppVersionPolicyBodySchema>;
