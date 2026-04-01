import app from './app';
import { config } from './config/env';
import { logger } from './config/logger';
import {
  startInactiveProductsCleanupCron,
  stopInactiveProductsCleanupCron,
} from './modules/product/product.cron';

const server = app.listen(config.PORT, () => {
  logger.info(`Server running on port ${config.PORT}`);
  startInactiveProductsCleanupCron();
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down...');
  stopInactiveProductsCleanupCron();
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
