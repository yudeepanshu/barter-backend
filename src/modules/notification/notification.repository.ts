import prisma from '../../config/db';

const db = prisma as any;

export const upsertPushDevice = async (params: {
  userId: string;
  expoPushToken: string;
  platform?: string;
  deviceId?: string;
}) => {
  return db.pushDevice.upsert({
    where: { expoPushToken: params.expoPushToken },
    create: {
      userId: params.userId,
      expoPushToken: params.expoPushToken,
      platform: params.platform,
      deviceId: params.deviceId,
      isActive: true,
      lastSeenAt: new Date(),
    },
    update: {
      userId: params.userId,
      platform: params.platform,
      deviceId: params.deviceId,
      isActive: true,
      lastSeenAt: new Date(),
    },
  });
};

export const deactivatePushDevice = async (userId: string, expoPushToken: string) => {
  return db.pushDevice.updateMany({
    where: {
      userId,
      expoPushToken,
      isActive: true,
    },
    data: {
      isActive: false,
      lastSeenAt: new Date(),
    },
  });
};

export const deactivatePushDevicesByTokens = async (tokens: string[]) => {
  if (tokens.length === 0) {
    return { count: 0 };
  }

  return db.pushDevice.updateMany({
    where: {
      expoPushToken: { in: tokens },
      isActive: true,
    },
    data: {
      isActive: false,
      lastSeenAt: new Date(),
    },
  });
};

export const getActivePushTokensByUserId = async (userId: string): Promise<string[]> => {
  const devices = await db.pushDevice.findMany({
    where: {
      userId,
      isActive: true,
    },
    select: {
      expoPushToken: true,
    },
  });

  return devices.map((device: { expoPushToken: string }) => device.expoPushToken);
};

export const createNotification = async (params: {
  userId: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}) => {
  return db.notification.create({
    data: {
      userId: params.userId,
      type: params.type,
      title: params.title,
      body: params.body,
      data: params.data,
    },
  });
};

export const listNotificationsByUserId = async (params: {
  userId: string;
  limit: number;
  unreadOnly: boolean;
  cursor?: { createdAt: Date; id: string };
}) => {
  const where: any = {
    userId: params.userId,
  };

  if (params.unreadOnly) {
    where.isRead = false;
  }

  if (params.cursor) {
    where.OR = [
      { createdAt: { lt: params.cursor.createdAt } },
      {
        createdAt: params.cursor.createdAt,
        id: { lt: params.cursor.id },
      },
    ];
  }

  return db.notification.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: params.limit + 1,
  });
};

export const markNotificationRead = async (userId: string, notificationId: string) => {
  return db.notification.updateMany({
    where: {
      id: notificationId,
      userId,
      isRead: false,
    },
    data: {
      isRead: true,
      readAt: new Date(),
    },
  });
};

export const markAllNotificationsRead = async (userId: string) => {
  return db.notification.updateMany({
    where: {
      userId,
      isRead: false,
    },
    data: {
      isRead: true,
      readAt: new Date(),
    },
  });
};

export const countUnreadNotifications = async (userId: string) => {
  return db.notification.count({
    where: {
      userId,
      isRead: false,
    },
  });
};
