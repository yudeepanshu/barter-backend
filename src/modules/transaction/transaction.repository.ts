import { AppError } from '../../common/errors/AppError';
import prisma from '../../config/db';

const db = prisma as any;

const transactionInclude = {
  product: {
    include: {
      productImages: true,
      category: true,
    },
  },
  buyer: true,
  seller: true,
  offer: {
    include: {
      offeredBy: true,
      offeredProducts: {
        include: {
          product: {
            include: {
              productImages: true,
              category: true,
            },
          },
        },
      },
    },
  },
  request: true,
  reservation: true,
};

type ProductTransferInstruction = {
  productId: string;
  fromOwnerId: string;
  toOwnerId: string;
};

const validateTransferredProducts = async (
  txDb: any,
  transfers: ProductTransferInstruction[],
  winningReservationId: string,
  winningTransactionId: string,
) => {
  const productIds = transfers.map((transfer) => transfer.productId);
  const products = await txDb.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, currentOwnerId: true },
  });

  if (products.length !== productIds.length) {
    throw new AppError('One or more exchanged products no longer exist', 409);
  }

  const productMap = new Map<string, any>(products.map((product: any) => [product.id, product]));

  for (const transfer of transfers) {
    const product = productMap.get(transfer.productId);
    if (!product || product.currentOwnerId !== transfer.fromOwnerId) {
      throw new AppError('One or more exchanged products changed ownership before completion', 409);
    }
  }

  const conflictingReservations = await txDb.productReservation.findMany({
    where: {
      productId: { in: productIds },
      status: 'ACTIVE',
      id: { not: winningReservationId },
    },
    select: { id: true },
  });

  if (conflictingReservations.length > 0) {
    throw new AppError(
      'One or more exchanged products are locked by another active reservation',
      409,
    );
  }

  const conflictingTransactions = await txDb.transaction.findMany({
    where: {
      productId: { in: productIds },
      status: { in: ['INITIATED', 'IN_PROGRESS'] },
      id: { not: winningTransactionId },
    },
    select: { id: true },
  });

  if (conflictingTransactions.length > 0) {
    throw new AppError('One or more exchanged products are already in another transaction', 409);
  }
};

const cancelActiveProductWorkflows = async (
  txDb: any,
  productIds: string[],
  now: Date,
  excludedRequestId: string,
  excludedReservationId: string,
  excludedTransactionId: string,
) => {
  const requestsToCancel = await txDb.request.findMany({
    where: {
      productId: { in: productIds },
      status: { in: ['PENDING', 'NEGOTIATING', 'ACCEPTED'] },
      id: { not: excludedRequestId },
    },
    select: { id: true },
  });

  const requestIds = requestsToCancel.map((request: any) => request.id);

  if (requestIds.length > 0) {
    await txDb.requestOffer.updateMany({
      where: {
        requestId: { in: requestIds },
        status: { in: ['ACTIVE', 'ACCEPTED'] },
      },
      data: {
        status: 'CANCELLED',
      },
    });

    await txDb.request.updateMany({
      where: { id: { in: requestIds } },
      data: {
        status: 'CANCELLED',
        cancelledReason: 'EXCHANGED',
      },
    });
  }

  await txDb.productReservation.updateMany({
    where: {
      productId: { in: productIds },
      status: 'ACTIVE',
      id: { not: excludedReservationId },
    },
    data: {
      status: 'CANCELLED',
      cancelledReason: 'EXCHANGED',
    },
  });

  const transactionsToCancel = await txDb.transaction.findMany({
    where: {
      productId: { in: productIds },
      status: { in: ['INITIATED', 'IN_PROGRESS'] },
      id: { not: excludedTransactionId },
    },
    select: { id: true },
  });

  const transactionIds = transactionsToCancel.map((transaction: any) => transaction.id);

  if (transactionIds.length > 0) {
    await txDb.transaction.updateMany({
      where: { id: { in: transactionIds } },
      data: {
        status: 'CANCELLED',
        cancelledAt: now,
        cancelledReason: 'EXCHANGED',
      },
    });

    await txDb.transactionOTP.updateMany({
      where: {
        transactionId: { in: transactionIds },
        verifiedAt: null,
        invalidatedAt: null,
      },
      data: {
        invalidatedAt: now,
      },
    });
  }
};

const transferProductOwnership = async (
  txDb: any,
  transfer: ProductTransferInstruction,
  now: Date,
) => {
  await txDb.productOwnershipHistory.updateMany({
    where: {
      productId: transfer.productId,
      releasedAt: null,
    },
    data: {
      releasedAt: now,
    },
  });

  await txDb.productOwnershipHistory.create({
    data: {
      productId: transfer.productId,
      ownerId: transfer.toOwnerId,
      acquiredAt: now,
    },
  });

  await txDb.product.update({
    where: { id: transfer.productId },
    data: {
      currentOwnerId: transfer.toOwnerId,
      status: 'EXCHANGED',
      isListed: false,
      isPreOwned: true,
      lastExchangedAt: now,
      exchangeCount: { increment: 1 },
      overrideCount: 0,
      lastOverrideAt: null,
      cooldownUntil: null,
    },
  });
};

export const findTransactionById = async (transactionId: string) => {
  return db.transaction.findUnique({
    where: { id: transactionId },
    include: transactionInclude,
  });
};

export const findTransactionByIdForUser = async (transactionId: string, userId: string) => {
  return db.transaction.findFirst({
    where: {
      id: transactionId,
      OR: [{ buyerId: userId }, { sellerId: userId }],
    },
    include: transactionInclude,
  });
};

export const findActiveTransactionForUser = async (params: {
  userId: string;
  requestId?: string;
  productId?: string;
}) => {
  return db.transaction.findFirst({
    where: {
      OR: [{ buyerId: params.userId }, { sellerId: params.userId }],
      status: {
        in: ['INITIATED', 'IN_PROGRESS'],
      },
      ...(params.requestId ? { requestId: params.requestId } : {}),
      ...(params.productId ? { productId: params.productId } : {}),
    },
    include: transactionInclude,
    orderBy: { createdAt: 'desc' },
  });
};

export const invalidateOpenOtps = async (txDb: any, transactionId: string) => {
  await txDb.transactionOTP.updateMany({
    where: {
      transactionId,
      verifiedAt: null,
      invalidatedAt: null,
    },
    data: {
      invalidatedAt: new Date(),
    },
  });
};

export const startTransactionAndCreateOtp = async (params: {
  transactionId: string;
  buyerId: string;
  otpHash: string;
  expiresAt: Date;
}) => {
  return db.$transaction(async (tx: any) => {
    const txDb = tx as any;

    const transaction = await txDb.transaction.findUnique({
      where: { id: params.transactionId },
    });

    if (!transaction) {
      throw new AppError('Transaction not found', 404);
    }

    if (transaction.status === 'COMPLETED') {
      throw new AppError('Transaction is already completed', 409);
    }

    if (transaction.status === 'CANCELLED') {
      throw new AppError('Transaction is cancelled', 409);
    }

    await invalidateOpenOtps(txDb, params.transactionId);

    await txDb.transaction.update({
      where: { id: params.transactionId },
      data: {
        status: 'IN_PROGRESS',
        startedAt: transaction.startedAt ?? new Date(),
      },
    });

    const otp = await txDb.transactionOTP.create({
      data: {
        transactionId: params.transactionId,
        generatedForId: params.buyerId,
        otpHash: params.otpHash,
        expiresAt: params.expiresAt,
      },
    });

    return otp;
  });
};

export const findLatestActiveOtpForTransaction = async (
  transactionId: string,
  generatedForId: string,
) => {
  return db.transactionOTP.findFirst({
    where: {
      transactionId,
      generatedForId,
      verifiedAt: null,
      invalidatedAt: null,
    },
    orderBy: { createdAt: 'desc' },
  });
};

export const incrementOtpAttempt = async (otpId: string) => {
  return db.transactionOTP.update({
    where: { id: otpId },
    data: {
      attemptCount: { increment: 1 },
    },
  });
};

export const invalidateOtp = async (otpId: string) => {
  await db.transactionOTP.update({
    where: { id: otpId },
    data: {
      invalidatedAt: new Date(),
    },
  });
};

export const completeTransaction = async (params: { transactionId: string; otpId: string }) => {
  return db.$transaction(async (tx: any) => {
    const txDb = tx as any;

    const transaction = await txDb.transaction.findUnique({
      where: { id: params.transactionId },
      include: {
        offer: {
          include: {
            offeredProducts: true,
          },
        },
      },
    });

    if (!transaction) {
      throw new AppError('Transaction not found', 404);
    }

    if (transaction.status === 'COMPLETED') {
      throw new AppError('Transaction is already completed', 409);
    }

    if (transaction.status === 'CANCELLED') {
      throw new AppError('Transaction is cancelled', 409);
    }

    const now = new Date();
    const offeredProductsRecipientId =
      transaction.offer.offeredById === transaction.buyerId
        ? transaction.sellerId
        : transaction.buyerId;

    const transfers: ProductTransferInstruction[] = [
      {
        productId: transaction.productId,
        fromOwnerId: transaction.sellerId,
        toOwnerId: transaction.buyerId,
      },
      ...transaction.offer.offeredProducts.map((offeredProduct: any) => ({
        productId: offeredProduct.productId,
        fromOwnerId: transaction.offer.offeredById,
        toOwnerId: offeredProductsRecipientId,
      })),
    ];

    await validateTransferredProducts(txDb, transfers, transaction.reservationId, transaction.id);

    await txDb.transactionOTP.update({
      where: { id: params.otpId },
      data: {
        verifiedAt: now,
      },
    });

    await txDb.transaction.update({
      where: { id: params.transactionId },
      data: {
        status: 'COMPLETED',
        completedAt: now,
      },
    });

    await txDb.productReservation.update({
      where: { id: transaction.reservationId },
      data: {
        status: 'COMPLETED',
      },
    });

    await txDb.request.update({
      where: { id: transaction.requestId },
      data: {
        status: 'COMPLETED',
      },
    });

    await cancelActiveProductWorkflows(
      txDb,
      transfers.map((transfer) => transfer.productId),
      now,
      transaction.requestId,
      transaction.reservationId,
      transaction.id,
    );

    for (const transfer of transfers) {
      await transferProductOwnership(txDb, transfer, now);
    }

    return txDb.transaction.findUniqueOrThrow({
      where: { id: params.transactionId },
      include: transactionInclude,
    });
  });
};
