import { Response } from 'express';
import {
  API_ERROR_CODES,
  API_SUCCESS_CODES,
  ApiCode,
  ApiErrorCode,
  ApiSuccessCode,
  resolveApiMessage,
} from '../constants/apiResponses';

interface ApiResponse<T = any> {
  success: boolean;
  code?: ApiCode;
  message?: string;
  data?: T;
  error?: any;
  meta?: {
    requestId?: string;
    timestamp: string;
  };
}

export const sendSuccess = <T>(
  res: Response,
  data?: T,
  codeOrMessage: ApiSuccessCode | string = API_SUCCESS_CODES.SUCCESS,
  statusCode = 200,
) => {
  const resolved = resolveApiMessage(codeOrMessage);

  const response: ApiResponse<T> = {
    success: true,
    code: resolved.code,
    message: resolved.message,
    data,
    meta: {
      timestamp: new Date().toISOString(),
    },
  };

  return res.status(statusCode).json(response);
};

export const sendError = (
  res: Response,
  codeOrMessage: ApiErrorCode | string = API_ERROR_CODES.INTERNAL_SERVER_ERROR,
  statusCode = 500,
  error?: any,
) => {
  const resolved = resolveApiMessage(codeOrMessage);

  const response: ApiResponse = {
    success: false,
    code: resolved.code,
    message: resolved.message,
    error,
    meta: {
      timestamp: new Date().toISOString(),
    },
  };

  return res.status(statusCode).json(response);
};
