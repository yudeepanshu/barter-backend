import pino from 'pino';
import { AppLogger } from '../common/interfaces/logger';
import { config } from './env';

class PinoLogger implements AppLogger {
  private logger = pino({
    level: config.LOG_LEVEL,
  });

  info(message: string, meta: Record<string, unknown> = {}) {
    this.logger.info(meta, message);
  }

  warn(message: string, meta: Record<string, unknown> = {}) {
    this.logger.warn(meta, message);
  }

  error(message: string | Error, meta: Record<string, unknown> | string = {}) {
    if (message instanceof Error) {
      if (typeof meta === 'string') {
        this.logger.error({ err: message }, `${meta}: ${message.message}`);
      } else {
        this.logger.error({ ...meta, err: message }, message.message);
      }
    } else {
      if (typeof meta === 'string') {
        this.logger.error({ message: meta }, message);
      } else {
        this.logger.error(meta, message);
      }
    }
  }

  debug(message: string, meta: Record<string, unknown> = {}) {
    this.logger.debug(meta, message);
  }
}

export const logger: AppLogger = new PinoLogger();
