import * as otpService from './otp.service';
import * as userRepo from '../user/user.repository';
import * as userService from '../user/user.service';
import { generateTokens } from '../../common/utils/jwt';

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

  return { user, tokens };
};
