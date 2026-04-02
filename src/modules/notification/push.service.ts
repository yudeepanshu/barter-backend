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
  id?: string;
  status?: 'ok' | 'error';
  message?: string;
  details?: {
    error?: string;
  };
}

const summarizeAccessToken = (token: string) => {
  if (!token) {
    return { configured: false, length: 0, preview: 'missing' };
  }

  if (token.length <= 12) {
    return { configured: true, length: token.length, preview: 'redacted-short-token' };
  }

  return {
    configured: true,
    length: token.length,
    preview: `${token.slice(0, 6)}...${token.slice(-4)}`,
  };
};

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

  const accessTokenSummary = summarizeAccessToken(config.EXPO_PUSH_ACCESS_TOKEN);
  logger.info('Sending push batch to Expo', {
    count: normalizedMessages.length,
    accessToken: accessTokenSummary,
    sampleTargets: normalizedMessages.slice(0, 3).map((message) => message.to),
  });

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
        count: normalizedMessages.length,
        accessToken: accessTokenSummary,
      });
      return { invalidTokens: [] as string[] };
    }

    const payload = (await response.json()) as { data?: ExpoPushResponseItem[] };
    const items = Array.isArray(payload.data) ? payload.data : [];

    logger.info('Expo push batch response received', {
      requestedCount: normalizedMessages.length,
      ticketCount: items.length,
      okCount: items.filter((item) => item?.status === 'ok').length,
      errorCount: items.filter((item) => item?.status === 'error').length,
    });

    const invalidTokens: string[] = [];
    items.forEach((item, index) => {
      if (item?.status === 'error' && item.details?.error === 'DeviceNotRegistered') {
        invalidTokens.push(normalizedMessages[index].to);
      }

      if (item?.status === 'error') {
        logger.warn('Expo push ticket returned an error', {
          index,
          ticketId: item.id,
          token: normalizedMessages[index]?.to,
          status: item.status,
          detailsError: item.details?.error,
          message: item.message,
          error: item.details?.error ?? item.message ?? 'unknown',
        });
      }
    });

    if (items.length !== normalizedMessages.length) {
      logger.warn('Expo push response count mismatch', {
        requestedCount: normalizedMessages.length,
        ticketCount: items.length,
      });
    }

    return { invalidTokens };
  } catch (error) {
    logger.warn('Expo push send threw an error', {
      reason: error instanceof Error ? error.message : 'unknown',
      count: normalizedMessages.length,
      accessToken: accessTokenSummary,
    });
    return { invalidTokens: [] as string[] };
  }
};
