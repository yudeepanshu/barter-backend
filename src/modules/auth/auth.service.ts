import * as otpService from './otp.service';
import jwt from 'jsonwebtoken';
import { AppError } from '../../common/errors/AppError';
import * as userRepo from '../user/user.repository';
import * as userService from '../user/user.service';
import { generateTokens } from '../../common/utils/jwt';
import { config } from '../../config/env';

type TokenPayload = {
  id: string;
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
  let decoded: TokenPayload;

  try {
    decoded = jwt.verify(refreshToken, config.REFRESH_SECRET) as TokenPayload;
  } catch {
    throw new AppError('Invalid refresh token', 401);
  }

  const user = await userRepo.findUserById(decoded.id);

  if (!user) {
    throw new AppError('User not found for refresh token', 401);
  }

  return generateTokens(user.id);
};
