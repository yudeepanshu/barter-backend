import crypto from 'crypto';

import redis from '../../config/redis';
import { config } from '../../config/env';
import { AppError } from '../../common/errors/AppError';
import { EmailOtpSender } from './senders/emailSender';
import { OtpSender } from './senders/interface';
import { API_ERROR_CODES } from '../../common/constants/apiResponses';

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
    throw new Error(`Wait ${config.OTP_REQUEST_COOLDOWN_SECONDS} seconds before requesting again.`);
  }

  // Rate limit
  const count = await redis.incr(rateKey);
  if (count === 1) {
    await redis.expire(rateKey, config.OTP_EXPIRY);
  }

  if (count > config.OTP_REQUEST_MAX_REQUESTS) {
    throw new Error('Too many OTP requests. Try later.');
  }

  // Reset attempts on new OTP
  await redis.del(attemptsKey);

  // Store OTP
  await redis.set(otpKey, otp, 'EX', config.OTP_EXPIRY);

  // Cooldown
  await redis.set(cooldownKey, '1', 'EX', config.OTP_REQUEST_COOLDOWN_SECONDS);

  // Send OTP
  console.log(`Generated OTP for ${normalized}: ${otp}`);
  await otpSender.send(normalized, otp);
};

export const verifyOTP = async (identifier: string, code: string) => {
  const normalized = identifier.toLowerCase().trim();
  const sanitizedCode = code.trim();

  // TEMPORARY: Remove master OTP override after testing window ends.
  if (config.MASTER_OTP && sanitizedCode === config.MASTER_OTP) {
    const otpKey = `otp:${normalized}`;
    const attemptsKey = `otp:attempts:${normalized}`;
    await redis.del(otpKey);
    await redis.del(attemptsKey);
    return true;
  }

  const otpKey = `otp:${normalized}`;
  const attemptsKey = `otp:attempts:${normalized}`;

  const stored = await redis.get(otpKey);

  if (!stored) {
    throw new AppError(API_ERROR_CODES.OTP_EXPIRED, 400);
  }

  if (stored !== sanitizedCode) {
    const attempts = await redis.incr(attemptsKey);

    if (attempts === 1) {
      await redis.expire(attemptsKey, config.OTP_EXPIRY);
    }

    if (attempts > config.MAX_ATTEMPTS) {
      await redis.del(otpKey);
    }

    throw new AppError(API_ERROR_CODES.INVALID_OTP, 400);
  }

  // success
  await redis.del(otpKey);
  await redis.del(attemptsKey);

  return true;
};
