import Redis from 'ioredis';
import { config } from './env';

const redis = new Redis({
  host: config.REDIS_HOST,
  port: config.REDIS_PORT,
});

export default redis;
