import * as otpService from './otp.service';
import jwt from 'jsonwebtoken';
import { createHash } from 'crypto';
import { AppError } from '../../common/errors/AppError';
import * as userRepo from '../user/user.repository';
import * as userService from '../user/user.service';
import { generateTokens } from '../../common/utils/jwt';
import { config } from '../../config/env';
import { API_ERROR_CODES } from '../../common/constants/apiResponses';
import redis from '../../config/redis';
import { auditSecurityEvent } from '../../common/services/auditLogger';

type TokenPayload = {
  id: string;
  exp?: number;
};

const REFRESH_REVOKE_PREFIX = 'auth:revoked:refresh:';

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

const getRevokedRefreshKey = (refreshToken: string) =>
  `${REFRESH_REVOKE_PREFIX}${hashToken(refreshToken)}`;

const getTtlSecondsUntilExpiry = (decoded: TokenPayload) => {
  if (!decoded.exp || !Number.isFinite(decoded.exp)) {
    return 1;
  }

  const ttlSeconds = Math.floor(decoded.exp - Date.now() / 1000);
  return ttlSeconds > 0 ? ttlSeconds : 1;
};

const verifyRefreshToken = (refreshToken: string): TokenPayload => {
  try {
    return jwt.verify(refreshToken, config.REFRESH_SECRET) as TokenPayload;
  } catch {
    throw new AppError(API_ERROR_CODES.INVALID_REFRESH_TOKEN, 401);
  }
};

const ensureRefreshTokenNotRevoked = async (refreshToken: string) => {
  const revokedKey = getRevokedRefreshKey(refreshToken);
  const isRevoked = await redis.get(revokedKey);
  if (isRevoked) {
    throw new AppError(API_ERROR_CODES.INVALID_REFRESH_TOKEN, 401);
  }
};

const revokeRefreshToken = async (refreshToken: string, decoded: TokenPayload) => {
  const revokedKey = getRevokedRefreshKey(refreshToken);
  const ttlSeconds = getTtlSecondsUntilExpiry(decoded);
  await redis.set(revokedKey, '1', 'EX', ttlSeconds);
};

const mapAuthUser = (user: {
  id: string;
  userName: string;
  email?: string | null;
  mobileNumber?: string | null;
  profilePicture?: string | null;
}) => ({
  id: user.id,
  userName: user.userName,
  email: user.email,
  mobileNumber: user.mobileNumber,
  profilePicture: user.profilePicture,
});

export const requestOtpService = async (identifier: string) => {
  await otpService.sendOTP(identifier);
};

export const verifyOtpService = async (identifier: string, code: string) => {
  await otpService.verifyOTP(identifier, code);

  let user = await userRepo.findUserByEmailOrPhone(identifier, identifier);

  if (!user) {
    const data = {
      userName: 'New User',
      email: identifier.includes('@') ? identifier : undefined,
      mobileNumber: !identifier.includes('@') ? identifier : undefined,
      allowPhone: true,
      allowEmail: false,
    };

    user = await userService.createUserService(data);
  }

  const tokens = generateTokens(user!.id);

  return { user: mapAuthUser(user!), tokens };
};

export const refreshTokenService = async (refreshToken: string) => {
  const decoded = verifyRefreshToken(refreshToken);
  await ensureRefreshTokenNotRevoked(refreshToken);

  const user = await userRepo.findUserById(decoded.id);

  if (!user) {
    throw new AppError(API_ERROR_CODES.USER_NOT_FOUND_FOR_REFRESH_TOKEN, 401);
  }

  // Rotate refresh token: once used, the previous token is revoked.
  await revokeRefreshToken(refreshToken, decoded);

  auditSecurityEvent({
    action: 'AUTH_REFRESH_TOKEN',
    outcome: 'SUCCESS',
    userId: user.id,
    details: {
      tokenRotated: true,
    },
  });

  return generateTokens(user.id);
};

export const logoutService = async (refreshToken: string) => {
  const decoded = verifyRefreshToken(refreshToken);
  await ensureRefreshTokenNotRevoked(refreshToken);
  await revokeRefreshToken(refreshToken, decoded);

  auditSecurityEvent({
    action: 'AUTH_LOGOUT',
    outcome: 'SUCCESS',
    userId: decoded.id,
    details: {
      tokenRevoked: true,
    },
  });
};
