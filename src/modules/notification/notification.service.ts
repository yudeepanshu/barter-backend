import { AppError } from '../../common/errors/AppError';
import { API_ERROR_CODES } from '../../common/constants/apiResponses';
import { logger } from '../../config/logger';
import * as repo from './notification.repository';
import type {
  ListNotificationsQueryInput,
  RegisterPushDeviceInput,
  UnregisterPushDeviceInput,
} from './notification.schema';
import { sendExpoPushMessages } from './push.service';

const summarizePushTokens = (tokens: string[]) => ({
  count: tokens.length,
  sample: tokens.slice(0, 3),
});

const encodeCursor = (createdAt: Date, id: string) => {
  return Buffer.from(`${createdAt.toISOString()}|${id}`, 'utf8').toString('base64');
};

const decodeCursor = (cursor: string): { createdAt: Date; id: string } => {
  const decoded = Buffer.from(cursor, 'base64').toString('utf8');
  const [createdAtRaw, id] = decoded.split('|');

  const createdAt = new Date(createdAtRaw);
  if (!id || Number.isNaN(createdAt.getTime())) {
    throw new AppError(API_ERROR_CODES.INVALID_CURSOR, 400);
  }

  return { createdAt, id };
};

export const registerPushDevice = async (
  userId: string | undefined,
  payload: RegisterPushDeviceInput,
) => {
  if (!userId) {
    throw new AppError(API_ERROR_CODES.UNAUTHORIZED, 401);
  }

  await repo.upsertPushDevice({
    userId,
    expoPushToken: payload.expoPushToken,
    platform: payload.platform,
    deviceId: payload.deviceId,
  });

  return { registered: true };
};

export const unregisterPushDevice = async (
  userId: string | undefined,
  payload: UnregisterPushDeviceInput,
) => {
  if (!userId) {
    throw new AppError(API_ERROR_CODES.UNAUTHORIZED, 401);
  }

  await repo.deactivatePushDevice(userId, payload.expoPushToken);
  return { unregistered: true };
};

export const getNotifications = async (
  userId: string | undefined,
  query: ListNotificationsQueryInput,
) => {
  if (!userId) {
    throw new AppError(API_ERROR_CODES.UNAUTHORIZED, 401);
  }

  const notifications = await repo.listNotificationsByUserId({
    userId,
    limit: query.limit,
    unreadOnly: query.unreadOnly,
    cursor: query.cursor ? decodeCursor(query.cursor) : undefined,
  });

  const hasMore = notifications.length > query.limit;
  const items = hasMore ? notifications.slice(0, query.limit) : notifications;
  const nextCursor =
    hasMore && items.length > 0
      ? encodeCursor(items[items.length - 1].createdAt, items[items.length - 1].id)
      : null;

  const unreadCount = await repo.countUnreadNotifications(userId);

  return {
    items,
    nextCursor,
    hasMore,
    unreadCount,
  };
};

export const markNotificationRead = async (userId: string | undefined, notificationId: string) => {
  if (!userId) {
    throw new AppError(API_ERROR_CODES.UNAUTHORIZED, 401);
  }

  await repo.markNotificationRead(userId, notificationId);
  const unreadCount = await repo.countUnreadNotifications(userId);
  return { marked: true, unreadCount };
};

export const markAllNotificationsRead = async (userId: string | undefined) => {
  if (!userId) {
    throw new AppError(API_ERROR_CODES.UNAUTHORIZED, 401);
  }

  await repo.markAllNotificationsRead(userId);
  return { marked: true, unreadCount: 0 };
};

export const clearAllNotifications = async (userId: string | undefined) => {
  if (!userId) {
    throw new AppError(API_ERROR_CODES.UNAUTHORIZED, 401);
  }

  await repo.deleteAllNotifications(userId);
  return { cleared: true };
};

export const dispatchNotificationToUser = async (params: {
  userId: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}) => {
  await repo.createNotification({
    userId: params.userId,
    type: params.type,
    title: params.title,
    body: params.body,
    data: params.data,
  });

  const tokens = await repo.getActivePushTokensByUserId(params.userId);
  if (tokens.length === 0) {
    logger.info('Skipping remote push notification because user has no active push tokens', {
      userId: params.userId,
      type: params.type,
    });
    return;
  }

  logger.info('Dispatching remote push notification', {
    userId: params.userId,
    type: params.type,
    tokens: summarizePushTokens(tokens),
  });

  const { invalidTokens } = await sendExpoPushMessages(
    tokens.map((token) => ({
      to: token,
      title: params.title,
      body: params.body,
      data: params.data,
    })),
  );

  if (invalidTokens.length > 0) {
    await repo.deactivatePushDevicesByTokens(invalidTokens);
    logger.info('Deactivated invalid push tokens', {
      count: invalidTokens.length,
      userId: params.userId,
      type: params.type,
      tokens: invalidTokens,
    });
  }
};
