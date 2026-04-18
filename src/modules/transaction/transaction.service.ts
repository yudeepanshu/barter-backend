import crypto from 'crypto';

import { AppError } from '../../common/errors/AppError';
import { API_ERROR_CODES } from '../../common/constants/apiResponses';
import { config } from '../../config/env';
import { logger } from '../../config/logger';
import { eventDispatcher } from '../../events/eventDispatcher';
import * as repo from './transaction.repository';
import { GetActiveTransactionQueryInput, VerifyTransactionOtpInput } from './transaction.schema';

const OTP_EXPIRY_MS = config.TRANSACTION_OTP_EXPIRY_SECONDS * 1000;
const OTP_MAX_ATTEMPTS = config.TRANSACTION_OTP_MAX_ATTEMPTS;

const generateNumericOtp = () => crypto.randomInt(100000, 1000000).toString();
const hashOtp = (otp: string) => crypto.createHash('sha256').update(otp).digest('hex');

const publishTransactionRealtimeUpdate = async (params: {
  transaction: {
    id: string;
    requestId: string;
    productId: string;
    buyerId: string;
    sellerId: string;
    status: string;
  };
  action:
    | 'INITIATED'
    | 'IN_PROGRESS'
    | 'COMPLETED'
    | 'CANCELLED'
    | 'OTP_EXPIRED'
    | 'OTP_INVALIDATED';
  actorId?: string;
}) => {
  try {
    await eventDispatcher.publish('transaction.updated', {
      transactionId: params.transaction.id,
      requestId: params.transaction.requestId,
      productId: params.transaction.productId,
      buyerId: params.transaction.buyerId,
      sellerId: params.transaction.sellerId,
      status: params.transaction.status,
      action: params.action,
      actorId: params.actorId,
    });
  } catch (error) {
    logger.warn('Failed to publish transaction realtime event', {
      transactionId: params.transaction.id,
      action: params.action,
      reason: error instanceof Error ? error.message : 'unknown',
    });
  }
};

export const generateTransactionOtp = async (transactionId: string, userId?: string) => {
  if (!userId) {
    throw new AppError(API_ERROR_CODES.UNAUTHORIZED, 401);
  }

  const transaction = await repo.findTransactionByIdForUser(transactionId, userId);
  if (!transaction) {
    throw new AppError(API_ERROR_CODES.TRANSACTION_NOT_FOUND, 404);
  }

  if (transaction.buyerId !== userId) {
    throw new AppError(API_ERROR_CODES.ONLY_BUYER_CAN_GENERATE_OTP, 403);
  }

  if (transaction.status === 'CANCELLED') {
    throw new AppError(API_ERROR_CODES.TRANSACTION_CANCELLED, 409);
  }

  if (transaction.status === 'COMPLETED') {
    throw new AppError(API_ERROR_CODES.TRANSACTION_ALREADY_COMPLETED, 409);
  }

  const otp = generateNumericOtp();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);

  await repo.startTransactionAndCreateOtp({
    transactionId,
    buyerId: transaction.buyerId,
    otpHash: hashOtp(otp),
    expiresAt,
  });

  await publishTransactionRealtimeUpdate({
    transaction: {
      id: transaction.id,
      requestId: transaction.requestId,
      productId: transaction.productId,
      buyerId: transaction.buyerId,
      sellerId: transaction.sellerId,
      status: 'IN_PROGRESS',
    },
    action: 'IN_PROGRESS',
    actorId: userId,
  });

  return {
    transactionId,
    otp,
    expiresAt,
  };
};

export const verifyTransactionOtp = async (
  transactionId: string,
  payload: VerifyTransactionOtpInput,
  userId?: string,
) => {
  if (!userId) {
    throw new AppError(API_ERROR_CODES.UNAUTHORIZED, 401);
  }

  const transaction = await repo.findTransactionByIdForUser(transactionId, userId);
  if (!transaction) {
    throw new AppError(API_ERROR_CODES.TRANSACTION_NOT_FOUND, 404);
  }

  if (transaction.sellerId !== userId) {
    throw new AppError(API_ERROR_CODES.ONLY_SELLER_CAN_VERIFY_OTP, 403);
  }

  if (transaction.status !== 'IN_PROGRESS') {
    throw new AppError(API_ERROR_CODES.TRANSACTION_NOT_IN_PROGRESS, 409);
  }

  const activeOtp = await repo.findLatestActiveOtpForTransaction(
    transactionId,
    transaction.buyerId,
  );
  if (!activeOtp) {
    throw new AppError(API_ERROR_CODES.NO_ACTIVE_OTP, 404);
  }

  const now = new Date();
  if (activeOtp.expiresAt <= now) {
    await repo.invalidateOtp(activeOtp.id);
    throw new AppError(API_ERROR_CODES.OTP_EXPIRED, 400);
  }

  const incomingHash = hashOtp(payload.otp);
  if (incomingHash !== activeOtp.otpHash) {
    const otpAfterAttempt = await repo.incrementOtpAttempt(activeOtp.id);
    if (otpAfterAttempt.attemptCount >= OTP_MAX_ATTEMPTS) {
      await repo.invalidateOtp(activeOtp.id);
    }
    throw new AppError(API_ERROR_CODES.INVALID_OTP, 400);
  }

  const completedTransaction = await repo.completeTransaction({
    transactionId,
    otpId: activeOtp.id,
  });

  await publishTransactionRealtimeUpdate({
    transaction: completedTransaction,
    action: 'COMPLETED',
    actorId: userId,
  });

  try {
    await eventDispatcher.publish('request.updated', {
      requestId: completedTransaction.requestId,
      productId: completedTransaction.productId,
      buyerId: completedTransaction.buyerId,
      sellerId: completedTransaction.sellerId,
      status: 'COMPLETED',
      currentTurn: null,
      action: 'COMPLETED',
      actorId: userId,
    });

    await eventDispatcher.publish('product.updated', {
      productId: completedTransaction.productId,
      ownerId: completedTransaction.buyerId,
      actorId: userId,
      status: 'EXCHANGED',
      isListed: false,
      action: 'EXCHANGED',
      relatedRequestId: completedTransaction.requestId,
      relatedTransactionId: completedTransaction.id,
    });
  } catch (error) {
    logger.warn('Failed to publish request/product realtime events from transaction completion', {
      transactionId: completedTransaction.id,
      reason: error instanceof Error ? error.message : 'unknown',
    });
  }

  return completedTransaction;
};

export const getActiveTransaction = async (
  query: GetActiveTransactionQueryInput,
  userId?: string,
) => {
  if (!userId) {
    throw new AppError(API_ERROR_CODES.UNAUTHORIZED, 401);
  }

  const transaction = await repo.findActiveTransactionForUser({
    userId,
    requestId: query.requestId,
    productId: query.productId,
  });

  if (!transaction) {
    throw new AppError(API_ERROR_CODES.ACTIVE_TRANSACTION_NOT_FOUND, 404);
  }

  return transaction;
};
