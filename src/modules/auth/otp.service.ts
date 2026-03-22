import crypto from 'crypto';

import redis from '../../config/redis';
import { config } from '../../config/env';
import { AppError } from '../../common/errors/AppError';
import { EmailOtpSender } from './senders/emailSender';
import { OtpSender } from './senders/interface';

const otpSender: OtpSender = new EmailOtpSender();

export const generateOTP = () => crypto.randomInt(100000, 999999).toString();

export const sendOTP = async (identifier: string) => {
  const normalized = identifier.toLowerCase().trim();

  const otp = generateOTP();

  const rateKey = `otp:rate:${normalized}`;
  const otpKey = `otp:${normalized}`;
  const attemptsKey = `otp:attempts:${normalized}`;
  const cooldownKey = `otp:cooldown:${normalized}`;

  // Cooldown
  const cooldown = await redis.exists(cooldownKey);
  if (cooldown) {
    throw new Error('Wait 30 seconds before requesting again.');
  }

  // Rate limit
  const count = await redis.incr(rateKey);
  if (count === 1) {
    await redis.expire(rateKey, config.OTP_EXPIRY);
  }

  if (count > 3) {
    throw new Error('Too many OTP requests. Try later.');
  }

  // Reset attempts on new OTP
  await redis.del(attemptsKey);

  // Store OTP
  await redis.set(otpKey, otp, 'EX', config.OTP_EXPIRY);

  // Cooldown
  await redis.set(cooldownKey, '1', 'EX', 30);

  // Send OTP
  await otpSender.send(normalized, otp);
};

export const verifyOTP = async (identifier: string, code: string) => {
  const normalized = identifier.toLowerCase().trim();

  const otpKey = `otp:${normalized}`;
  const attemptsKey = `otp:attempts:${normalized}`;

  const stored = await redis.get(otpKey);

  if (!stored) {
    throw new AppError('OTP expired', 400);
  }

  if (stored !== code) {
    const attempts = await redis.incr(attemptsKey);

    if (attempts === 1) {
      await redis.expire(attemptsKey, config.OTP_EXPIRY);
    }

    if (attempts > config.MAX_ATTEMPTS) {
      await redis.del(otpKey);
    }

    throw new AppError('Invalid OTP', 400);
  }

  // success
  await redis.del(otpKey);
  await redis.del(attemptsKey);

  return true;
};
