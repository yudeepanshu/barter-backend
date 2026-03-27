import { Request, Response } from 'express';

import { sendSuccess } from '../../common/utils/responseHandler';
import {
  getActiveTransactionQuerySchema,
  transactionIdParamSchema,
  verifyTransactionOtpSchema,
} from './transaction.schema';
import * as transactionService from './transaction.service';

export const getActiveTransaction = async (req: Request, res: Response) => {
  const query = getActiveTransactionQuerySchema.parse(req.query);
  const userId = req.user?.id;

  const result = await transactionService.getActiveTransaction(query, userId);
  return sendSuccess(res, result);
};

export const generateOtp = async (req: Request, res: Response) => {
  const { id: transactionId } = transactionIdParamSchema.parse(req.params);
  const userId = req.user?.id;

  const result = await transactionService.generateTransactionOtp(transactionId, userId);
  return sendSuccess(res, result, 'OTP generated');
};

export const verifyOtp = async (req: Request, res: Response) => {
  const { id: transactionId } = transactionIdParamSchema.parse(req.params);
  const payload = verifyTransactionOtpSchema.parse(req.body);
  const userId = req.user?.id;

  const result = await transactionService.verifyTransactionOtp(transactionId, payload, userId);
  return sendSuccess(res, result, 'Transaction completed');
};
