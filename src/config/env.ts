import dotenv from 'dotenv';

dotenv.config();

export interface EnvConfig {
  PORT: number;
  NODE_ENV: string;
}

export const config: EnvConfig = {
  PORT: Number(process.env.PORT) || 8000,
  NODE_ENV: process.env.NODE_ENV || 'development',
};
