import jwt from 'jsonwebtoken';
import { config } from '../../config/env';

export const generateTokens = (userId: string) => {
  const accessToken = jwt.sign({ userId }, config.ACCESS_SECRET, {
    expiresIn: '15m',
  });

  const refreshToken = jwt.sign({ userId }, config.REFRESH_SECRET, {
    expiresIn: '7d',
  });

  return { accessToken, refreshToken };
};
