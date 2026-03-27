import jwt from 'jsonwebtoken';
import { config } from '../../config/env';

export const generateTokens = (id: string) => {
  const accessToken = jwt.sign({ id }, config.ACCESS_SECRET, {
    expiresIn: config.JWT_ACCESS_EXPIRES_IN as any,
  });

  const refreshToken = jwt.sign({ id }, config.REFRESH_SECRET, {
    expiresIn: config.JWT_REFRESH_EXPIRES_IN as any,
  });

  return { accessToken, refreshToken };
};
