import dotenv from 'dotenv';

dotenv.config();

export interface EnvConfig {
  PORT: number;
  NODE_ENV: string;
  LOG_LEVEL: string;
  CORS_ORIGIN: string;
  ACCESS_SECRET: string;
  REFRESH_SECRET: string;
  JWT_ACCESS_EXPIRES_IN: string;
  JWT_REFRESH_EXPIRES_IN: string;
  OTP_EXPIRY: number;
  MAX_ATTEMPTS: number;
  OTP_REQUEST_COOLDOWN_SECONDS: number;
  OTP_REQUEST_MAX_REQUESTS: number;
  MASTER_OTP: string;
  TRANSACTION_OTP_EXPIRY_SECONDS: number;
  TRANSACTION_OTP_MAX_ATTEMPTS: number;
  REQUEST_MAX_OVERRIDE_COUNT: number;
  REQUEST_LAST_SAFE_OVERRIDE_COUNT: number;
  REQUEST_OVERRIDE_COOLDOWN_DAYS: number;
  INACTIVE_PRODUCT_EXPIRY_DAYS: number;
  INACTIVE_PRODUCT_CLEANUP_CRON: string;
  INACTIVE_PRODUCT_CLEANUP_CRON_TIMEZONE: string;
  PRODUCT_DISCOVERY_CACHE_TTL_SECONDS: number;
  REDIS_URL: string;
  REDIS_HOST: string;
  REDIS_PORT: number;
  REDIS_PASSWORD: string;
  ADMIN_KEY_HASH: string;
  EMAIL: {
    API_KEY: string;
    FROM: string;
  };
  STORAGE: {
    PROVIDER: string;
    S3_BUCKET: string;
    S3_REGION: string;
    S3_ACCESS_KEY_ID: string;
    S3_SECRET_ACCESS_KEY: string;
    S3_PRESIGNED_URL_EXPIRES_IN_SECONDS: number;
  };
}

export const config: EnvConfig = {
  PORT: Number(process.env.PORT) || 8000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  LOG_LEVEL: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
  ACCESS_SECRET: process.env.ACCESS_SECRET || 'access_secret',
  REFRESH_SECRET: process.env.REFRESH_SECRET || 'refresh_secret',
  JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  OTP_EXPIRY: Number(process.env.OTP_EXPIRY) || 300,
  MAX_ATTEMPTS: Number(process.env.MAX_ATTEMPTS) || 5,
  OTP_REQUEST_COOLDOWN_SECONDS: Number(process.env.OTP_REQUEST_COOLDOWN_SECONDS) || 30,
  OTP_REQUEST_MAX_REQUESTS: Number(process.env.OTP_REQUEST_MAX_REQUESTS) || 3,
  // TEMPORARY: Remove master OTP override after testing window ends.
  MASTER_OTP: process.env.MASTER_OTP || '',
  TRANSACTION_OTP_EXPIRY_SECONDS: Number(process.env.TRANSACTION_OTP_EXPIRY_SECONDS) || 300,
  TRANSACTION_OTP_MAX_ATTEMPTS: Number(process.env.TRANSACTION_OTP_MAX_ATTEMPTS) || 5,
  REQUEST_MAX_OVERRIDE_COUNT: Number(process.env.REQUEST_MAX_OVERRIDE_COUNT) || 5,
  REQUEST_LAST_SAFE_OVERRIDE_COUNT: Number(process.env.REQUEST_LAST_SAFE_OVERRIDE_COUNT) || 4,
  REQUEST_OVERRIDE_COOLDOWN_DAYS: Number(process.env.REQUEST_OVERRIDE_COOLDOWN_DAYS) || 7,
  INACTIVE_PRODUCT_EXPIRY_DAYS: Number(process.env.INACTIVE_PRODUCT_EXPIRY_DAYS) || 7,
  INACTIVE_PRODUCT_CLEANUP_CRON: process.env.INACTIVE_PRODUCT_CLEANUP_CRON || '0 2 * * *',
  INACTIVE_PRODUCT_CLEANUP_CRON_TIMEZONE:
    process.env.INACTIVE_PRODUCT_CLEANUP_CRON_TIMEZONE || 'UTC',
  PRODUCT_DISCOVERY_CACHE_TTL_SECONDS:
    Number(process.env.PRODUCT_DISCOVERY_CACHE_TTL_SECONDS) || 30,
  REDIS_URL: process.env.REDIS_URL || '',
  REDIS_HOST: process.env.REDIS_HOST || '127.0.0.1',
  REDIS_PORT: Number(process.env.REDIS_PORT) || 6379,
  REDIS_PASSWORD: process.env.REDIS_PASSWORD || '',
  ADMIN_KEY_HASH:
    process.env.ADMIN_KEY_HASH || '$2a$10$wXAHnDqfPkKBYClIWL7sW.z7K1H7U3q8FjKz8X5FjKz8X5FjKz8X5',
  EMAIL: {
    API_KEY: process.env.RESEND_API_KEY || '',
    FROM: process.env.EMAIL_FROM || 'noreply@barter.com',
  },
  STORAGE: {
    PROVIDER: process.env.BLOB_STORAGE_PROVIDER || 's3',
    S3_BUCKET: process.env.S3_BUCKET_NAME || '',
    S3_REGION: process.env.S3_REGION || 'us-east-1',
    S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID || '',
    S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY || '',
    S3_PRESIGNED_URL_EXPIRES_IN_SECONDS:
      Number(process.env.S3_PRESIGNED_URL_EXPIRES_IN_SECONDS) || 3600,
  },
};
