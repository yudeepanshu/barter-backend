import Redis from 'ioredis';
import { config } from './env';

const redis = config.REDIS_URL
  ? new Redis(config.REDIS_URL)
  : new Redis({
      host: config.REDIS_HOST,
      port: config.REDIS_PORT,
      password: config.REDIS_PASSWORD || undefined,
    });

export default redis;
