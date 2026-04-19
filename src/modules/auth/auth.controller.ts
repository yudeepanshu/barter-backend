import { Request, Response } from 'express';
import { sendSuccess } from '../../common/utils/responseHandler';
import * as authService from './auth.service';
import { API_SUCCESS_CODES } from '../../common/constants/apiResponses';
import { auditFromRequest } from '../../common/services/auditLogger';

const resolveIdentifierType = (identifier: string) =>
  identifier.includes('@') ? 'email' : 'phone';

export const requestOtp = async (req: Request, res: Response) => {
  try {
    await authService.requestOtpService(req.body.identifier);

    auditFromRequest(req, {
      action: 'AUTH_OTP_REQUEST',
      outcome: 'SUCCESS',
      details: {
        identifierType: resolveIdentifierType(req.body.identifier),
      },
    });

    return sendSuccess(res, null, API_SUCCESS_CODES.OTP_SENT);
  } catch (error) {
    auditFromRequest(req, {
      action: 'AUTH_OTP_REQUEST',
      outcome: 'FAILURE',
      reason: error instanceof Error ? error.message : 'request otp failed',
      details: {
        identifierType: resolveIdentifierType(req.body.identifier),
      },
    });

    throw error;
  }
};

export const verifyOtp = async (req: Request, res: Response) => {
  const { identifier, code } = req.body;

  try {
    const result = await authService.verifyOtpService(identifier, code);

    auditFromRequest(req, {
      action: 'AUTH_OTP_VERIFY',
      outcome: 'SUCCESS',
      details: {
        identifierType: resolveIdentifierType(identifier),
        authenticatedUserId: result.user.id,
      },
    });

    return sendSuccess(res, result, API_SUCCESS_CODES.LOGIN_SUCCESSFUL);
  } catch (error) {
    auditFromRequest(req, {
      action: 'AUTH_OTP_VERIFY',
      outcome: 'FAILURE',
      reason: error instanceof Error ? error.message : 'verify otp failed',
      details: {
        identifierType: resolveIdentifierType(identifier),
      },
    });

    throw error;
  }
};

export const loginWithGoogle = async (req: Request, res: Response) => {
  const { idToken } = req.body;

  try {
    const result = await authService.googleLoginService(idToken);

    auditFromRequest(req, {
      action: 'AUTH_GOOGLE_LOGIN',
      outcome: 'SUCCESS',
      details: {
        identifierType: 'google',
        authenticatedUserId: result.user.id,
      },
    });

    return sendSuccess(res, result, API_SUCCESS_CODES.LOGIN_SUCCESSFUL);
  } catch (error) {
    auditFromRequest(req, {
      action: 'AUTH_GOOGLE_LOGIN',
      outcome: 'FAILURE',
      reason: error instanceof Error ? error.message : 'google login failed',
      details: {
        identifierType: 'google',
      },
    });

    throw error;
  }
};

export const refreshToken = async (req: Request, res: Response) => {
  const { refreshToken } = req.body;

  try {
    const result = await authService.refreshTokenService(refreshToken);

    auditFromRequest(req, {
      action: 'AUTH_REFRESH_TOKEN',
      outcome: 'SUCCESS',
    });

    return sendSuccess(res, result, API_SUCCESS_CODES.TOKEN_REFRESHED);
  } catch (error) {
    auditFromRequest(req, {
      action: 'AUTH_REFRESH_TOKEN',
      outcome: 'FAILURE',
      reason: error instanceof Error ? error.message : 'refresh token failed',
    });

    throw error;
  }
};

export const logout = async (req: Request, res: Response) => {
  const { refreshToken } = req.body;

  try {
    await authService.logoutService(refreshToken);

    auditFromRequest(req, {
      action: 'AUTH_LOGOUT',
      outcome: 'SUCCESS',
    });

    return sendSuccess(res, null, API_SUCCESS_CODES.LOGOUT_SUCCESSFUL);
  } catch (error) {
    auditFromRequest(req, {
      action: 'AUTH_LOGOUT',
      outcome: 'FAILURE',
      reason: error instanceof Error ? error.message : 'logout failed',
    });

    throw error;
  }
};
