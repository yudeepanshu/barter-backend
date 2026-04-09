import app from './app';
import { createServer } from 'http';
import { config } from './config/env';
import { logger } from './config/logger';
import { registerRealtimeSubscribers } from './events/realtimeSubscribers';
import {
  startInactiveProductsCleanupCron,
  stopInactiveProductsCleanupCron,
} from './modules/product/product.cron';
import { socketManager } from './sockets/socketManager';

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

const httpServer = createServer(app);

socketManager.initialize(httpServer);
registerRealtimeSubscribers();

const server = httpServer.listen(config.PORT, () => {
  logger.info(`Server running on port ${config.PORT}`);
  logger.info('Expo push access token loaded', {
    expoPushAccessToken: summarizeAccessToken(config.EXPO_PUSH_ACCESS_TOKEN),
  });
  startInactiveProductsCleanupCron();
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down...');
  stopInactiveProductsCleanupCron();
  socketManager.close();
  server.close(() => {
    logger.info('Process terminated');
    process.exit(0);
  });
});

process.on('uncaughtException', (err) => {
  logger.error(err, { context: 'Uncaught exception' });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', { reason });
  process.exit(1);
});
