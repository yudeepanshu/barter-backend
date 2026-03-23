import dotenv from 'dotenv';

dotenv.config();

export interface EnvConfig {
  PORT: number;
  NODE_ENV: string;
  ACCESS_SECRET: string;
  REFRESH_SECRET: string;
  OTP_EXPIRY: number;
  MAX_ATTEMPTS: number;
  REDIS_HOST: string;
  REDIS_PORT: number;
  ADMIN_KEY_HASH: string;
  EMAIL: {
    API_KEY: string;
    FROM: string;
  };
  STORAGE: {
    PROVIDER: string;
    S3_BUCKET: string;
    S3_REGION: string;
  };
}

export const config: EnvConfig = {
  PORT: Number(process.env.PORT) || 8000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  ACCESS_SECRET: process.env.ACCESS_SECRET || 'access_secret',
  REFRESH_SECRET: process.env.REFRESH_SECRET || 'refresh_secret',
  OTP_EXPIRY: Number(process.env.OTP_EXPIRY) || 300,
  MAX_ATTEMPTS: Number(process.env.MAX_ATTEMPTS) || 5,
  REDIS_HOST: process.env.REDIS_HOST || '127.0.0.1',
  REDIS_PORT: Number(process.env.REDIS_PORT) || 6379,
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
  },
};
