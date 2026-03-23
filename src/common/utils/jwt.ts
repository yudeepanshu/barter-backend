import jwt from 'jsonwebtoken';
import { config } from '../../config/env';

export const generateTokens = (id: string) => {
  const accessToken = jwt.sign({ id }, config.ACCESS_SECRET, {
    expiresIn: '15m',
  });

  const refreshToken = jwt.sign({ id }, config.REFRESH_SECRET, {
    expiresIn: '7d',
  });

  return { accessToken, refreshToken };
};
