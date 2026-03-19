import { Response } from 'express';

interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  error?: any;
  meta?: {
    requestId?: string;
    timestamp: string;
  };
}

export const sendSuccess = <T>(res: Response, data?: T, message = 'Success', statusCode = 200) => {
  const response: ApiResponse<T> = {
    success: true,
    message,
    data,
    meta: {
      timestamp: new Date().toISOString(),
    },
  };

  return res.status(statusCode).json(response);
};

export const sendError = (
  res: Response,
  message = 'Something went wrong',
  statusCode = 500,
  error?: any,
) => {
  const response: ApiResponse = {
    success: false,
    message,
    error,
    meta: {
      timestamp: new Date().toISOString(),
    },
  };

  return res.status(statusCode).json(response);
};
