import { z } from 'zod';

export const registerPushDeviceSchema = z.object({
  expoPushToken: z.string().trim().min(8),
  platform: z.string().trim().max(32).optional(),
  deviceId: z.string().trim().max(128).optional(),
});

export const unregisterPushDeviceSchema = z.object({
  expoPushToken: z.string().trim().min(8),
});

export const listNotificationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
  cursor: z.string().optional(),
  unreadOnly: z.coerce.boolean().optional().default(false),
});

export const notificationIdParamSchema = z.object({
  id: z.string().uuid(),
});

export type RegisterPushDeviceInput = z.infer<typeof registerPushDeviceSchema>;
export type UnregisterPushDeviceInput = z.infer<typeof unregisterPushDeviceSchema>;
export type ListNotificationsQueryInput = z.infer<typeof listNotificationsQuerySchema>;
