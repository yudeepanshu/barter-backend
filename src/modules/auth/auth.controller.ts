import { Request, Response } from 'express';
import { sendSuccess } from '../../common/utils/responseHandler';
import * as authService from './auth.service';
import { API_SUCCESS_CODES } from '../../common/constants/apiResponses';

export const requestOtp = async (req: Request, res: Response) => {
  await authService.requestOtpService(req.body.identifier);

  return sendSuccess(res, null, API_SUCCESS_CODES.OTP_SENT);
};

export const verifyOtp = async (req: Request, res: Response) => {
  const { identifier, code } = req.body;

  const result = await authService.verifyOtpService(identifier, code);

  return sendSuccess(res, result, API_SUCCESS_CODES.LOGIN_SUCCESSFUL);
};

export const refreshToken = async (req: Request, res: Response) => {
  const { refreshToken } = req.body;

  const result = await authService.refreshTokenService(refreshToken);

  return sendSuccess(res, result, API_SUCCESS_CODES.TOKEN_REFRESHED);
};
