import cron, { ScheduledTask } from 'node-cron';
import { logger } from '../../config/logger';
import { config } from '../../config/env';
import { markExpiredInactiveProductsAsRemoved } from './product.service';

let inactiveCleanupTask: ScheduledTask | null = null;

export const startInactiveProductsCleanupCron = () => {
  if (inactiveCleanupTask) {
    return;
  }

  inactiveCleanupTask = cron.schedule(
    config.INACTIVE_PRODUCT_CLEANUP_CRON,
    async () => {
      try {
        const result = await markExpiredInactiveProductsAsRemoved();
        logger.info('Inactive products cleanup cron completed', {
          markedRemovedCount: result.markedRemovedCount,
          inactiveExpiryDays: result.inactiveExpiryDays,
          inactiveBefore: result.inactiveBefore.toISOString(),
        });
      } catch (error) {
        logger.error(error as Error, { context: 'Inactive products cleanup cron failed' });
      }
    },
    {
      timezone: config.INACTIVE_PRODUCT_CLEANUP_CRON_TIMEZONE,
    },
  );

  logger.info('Inactive products cleanup cron started', {
    schedule: config.INACTIVE_PRODUCT_CLEANUP_CRON,
    timezone: config.INACTIVE_PRODUCT_CLEANUP_CRON_TIMEZONE,
  });
};

export const stopInactiveProductsCleanupCron = () => {
  if (!inactiveCleanupTask) {
    return;
  }

  inactiveCleanupTask.stop();
  inactiveCleanupTask = null;
  logger.info('Inactive products cleanup cron stopped');
};
