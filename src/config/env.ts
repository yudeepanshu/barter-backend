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
};
