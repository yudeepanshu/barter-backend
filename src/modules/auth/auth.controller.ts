import { Request, Response } from 'express';
import { sendSuccess } from '../../common/utils/responseHandler';
import * as authService from './auth.service';

export const requestOtp = async (req: Request, res: Response) => {
  await authService.requestOtpService(req.body.identifier);

  return sendSuccess(res, null, 'OTP sent');
};

export const verifyOtp = async (req: Request, res: Response) => {
  const { identifier, code } = req.body;

  const result = await authService.verifyOtpService(identifier, code);

  return sendSuccess(res, result, 'Login successful');
};
