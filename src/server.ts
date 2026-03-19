import app from './app';
import { config } from './config/env';
import { logger } from './config/logger';

const server = app.listen(config.PORT, () => {
  logger.info(`Server running on port ${config.PORT}`);
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down...');
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
