import { config } from '../../config/env';
import { logger } from '../../config/logger';

interface ExpoPushMessageInput {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default';
  channelId?: string;
  priority?: 'high';
}

interface ExpoPushResponseItem {
  status?: 'ok' | 'error';
  message?: string;
  details?: {
    error?: string;
  };
}

export const sendExpoPushMessages = async (messages: ExpoPushMessageInput[]) => {
  if (messages.length === 0) {
    return { invalidTokens: [] as string[] };
  }

  const normalizedMessages = messages.map((message) => ({
    sound: 'default' as const,
    channelId: 'default',
    priority: 'high' as const,
    ...message,
  }));

  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.EXPO_PUSH_ACCESS_TOKEN
          ? { Authorization: `Bearer ${config.EXPO_PUSH_ACCESS_TOKEN}` }
          : {}),
      },
      body: JSON.stringify(normalizedMessages),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.warn('Expo push send failed', {
        status: response.status,
        body: errorText,
      });
      return { invalidTokens: [] as string[] };
    }

    const payload = (await response.json()) as { data?: ExpoPushResponseItem[] };
    const items = Array.isArray(payload.data) ? payload.data : [];

    const invalidTokens: string[] = [];
    items.forEach((item, index) => {
      if (item?.status === 'error' && item.details?.error === 'DeviceNotRegistered') {
        invalidTokens.push(normalizedMessages[index].to);
      }

      if (item?.status === 'error') {
        logger.warn('Expo push ticket returned an error', {
          token: normalizedMessages[index]?.to,
          error: item.details?.error ?? item.message ?? 'unknown',
        });
      }
    });

    return { invalidTokens };
  } catch (error) {
    logger.warn('Expo push send threw an error', {
      reason: error instanceof Error ? error.message : 'unknown',
    });
    return { invalidTokens: [] as string[] };
  }
};
