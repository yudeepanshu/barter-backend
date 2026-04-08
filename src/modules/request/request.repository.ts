import { AppError } from '../../common/errors/AppError';
import { config } from '../../config/env';
import prisma from '../../config/db';

// NOTE: VS Code can lag behind prisma generate for brand-new models.
// Use local aliases to avoid false red squiggles while preserving runtime behavior.
const db = prisma as any;

type RequestStatus =
  | 'PENDING'
  | 'NEGOTIATING'
  | 'ACCEPTED'
  | 'COMPLETED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'CANCELLED';
type OfferType = 'PRODUCT' | 'MONEY' | 'MIXED' | 'NONE';
type ContactPreference = 'PHONE' | 'EMAIL' | 'BOTH';
type RequestTurn = 'BUYER' | 'SELLER';
type OfferStatus = 'ACTIVE' | 'SUPERSEDED' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';
type CancelReason = 'USER_CANCELLED' | 'EXPIRED' | 'OVERRIDDEN' | 'REJECTED';

const MAX_OVERRIDE_COUNT = config.REQUEST_MAX_OVERRIDE_COUNT;
const LAST_SAFE_OVERRIDE_COUNT = config.REQUEST_LAST_SAFE_OVERRIDE_COUNT;
const OVERRIDE_COOLDOWN_DAYS = config.REQUEST_OVERRIDE_COOLDOWN_DAYS;

type CreateRequestRecordInput = {
  productId: string;
  buyerId: string;
  sellerId: string;
  lifecycleVersion: number;
  allowProductAccess: boolean;
  message?: string;
  contactPreference: ContactPreference;
  expiresAt: Date;
  offerType: OfferType;
  amount?: number;
  offeredProducts: string[];
  visibleProducts: string[];
};

type CounterOfferRecordInput = {
  requestId: string;
  actorId: string;
  actorRole: RequestTurn;
  lifecycleVersion: number;
  offerType: OfferType;
  amount?: number;
  offeredProducts: string[];
  visibleProducts: string[];
  requestedProducts: string[];
  message?: string;
  expiresAt: Date;
};

const requestInclude = {
  product: {
    include: {
      productImages: true,
      category: true,
      owner: {
        select: {
          id: true,
          userName: true,
          profilePicture: true,
        },
      },
    },
  },
  buyer: {
    include: {
      contactPreference: true,
    },
  },
  seller: {
    include: {
      contactPreference: true,
    },
  },
  offers: {
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
      requestedProducts: {
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
    orderBy: { createdAt: 'asc' as const },
  },
  visibleProducts: {
    include: {
      product: {
        include: {
          productImages: true,
          category: true,
        },
      },
    },
  },
  reservations: {
    include: {
      contactRevealRequests: true,
    },
  },
  transactions: {
    select: {
      id: true,
      status: true,
      completedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  },
  contactRevealRequests: true,
};

export const findProductById = async (productId: string) => {
  return db.product.findUnique({
    where: { id: productId },
    include: { owner: true },
  });
};

export const findOwnedProductsByIds = async (ownerId: string, productIds: string[]) => {
  if (productIds.length === 0) {
    return [];
  }

  return db.product.findMany({
    where: {
      id: { in: productIds },
      currentOwnerId: ownerId,
      isListed: true,
      status: 'ACTIVE',
    },
    select: { id: true },
  });
};

export const findRequestThreadByParticipants = async (
  productId: string,
  buyerId: string,
  sellerId: string,
) => {
  return db.request.findFirst({
    where: {
      productId,
      buyerId,
      sellerId,
    },
  });
};

const markActiveOffers = async (txDb: any, requestId: string, status: OfferStatus) => {
  await txDb.requestOffer.updateMany({
    where: {
      requestId,
      status: 'ACTIVE',
    },
    data: {
      status,
    },
  });
};

const replaceVisibleProducts = async (txDb: any, requestId: string, productIds: string[]) => {
  await txDb.requestVisibleProduct.deleteMany({
    where: { requestId },
  });

  if (productIds.length > 0) {
    await txDb.requestVisibleProduct.createMany({
      data: productIds.map((productId) => ({
        requestId,
        productId,
      })),
    });
  }
};

const createOffer = async (
  txDb: any,
  requestId: string,
  offeredById: string,
  lifecycleVersion: number,
  offerType: OfferType,
  amount: number | undefined,
  offeredProducts: string[],
  requestedProducts: string[],
) => {
  const offer = await txDb.requestOffer.create({
    data: {
      requestId,
      offeredById,
      lifecycleVersion,
      type: offerType,
      offeredAmount: amount,
      status: 'ACTIVE',
    },
  });

  if (offeredProducts.length > 0) {
    await txDb.requestOfferProduct.createMany({
      data: offeredProducts.map((productId) => ({
        offerId: offer.id,
        productId,
      })),
    });
  }

  if (requestedProducts.length > 0) {
    await txDb.requestOfferRequestedProduct.createMany({
      data: requestedProducts.map((productId) => ({
        offerId: offer.id,
        productId,
      })),
    });
  }

  return offer;
};

export const upsertRequestThreadWithBuyerOffer = async (data: CreateRequestRecordInput) => {
  return db.$transaction(async (tx: any) => {
    const txDb = tx as any;

    const existingThread = await txDb.request.findFirst({
      where: {
        productId: data.productId,
        buyerId: data.buyerId,
        sellerId: data.sellerId,
      },
    });

    let request;
    if (existingThread) {
      request = await txDb.request.update({
        where: { id: existingThread.id },
        data: {
          status: 'PENDING',
          currentTurn: 'SELLER',
          allowProductAccess: data.allowProductAccess,
          message: data.message,
          contactPreference: data.contactPreference,
          lifecycleVersion: data.lifecycleVersion,
          expiresAt: data.expiresAt,
          updateCount: { increment: 1 },
          cancelledById: null,
          cancelledByRole: null,
          cancelledReason: null,
          acceptedOfferId: null,
        },
      });

      await markActiveOffers(txDb, existingThread.id, 'SUPERSEDED');
      await replaceVisibleProducts(txDb, existingThread.id, data.visibleProducts);

      await createOffer(
        txDb,
        existingThread.id,
        data.buyerId,
        data.lifecycleVersion,
        data.offerType,
        data.amount,
        data.offeredProducts,
        [],
      );

      await txDb.productReservation.updateMany({
        where: {
          requestId: existingThread.id,
          status: 'ACTIVE',
        },
        data: {
          status: 'CANCELLED',
          cancelledReason: 'USER_CANCELLED',
        },
      });
    } else {
      request = await txDb.request.create({
        data: {
          productId: data.productId,
          buyerId: data.buyerId,
          sellerId: data.sellerId,
          status: 'PENDING',
          currentTurn: 'SELLER',
          allowProductAccess: data.allowProductAccess,
          message: data.message,
          contactPreference: data.contactPreference,
          lifecycleVersion: data.lifecycleVersion,
          expiresAt: data.expiresAt,
        },
      });

      await replaceVisibleProducts(txDb, request.id, data.visibleProducts);

      await createOffer(
        txDb,
        request.id,
        data.buyerId,
        data.lifecycleVersion,
        data.offerType,
        data.amount,
        data.offeredProducts,
        [],
      );
    }

    return txDb.request.findUniqueOrThrow({
      where: { id: request.id },
      include: requestInclude,
    });
  });
};

export const findRequestByIdForUser = async (requestId: string, userId: string) => {
  return db.request.findFirst({
    where: {
      id: requestId,
      OR: [{ buyerId: userId }, { sellerId: userId }],
    },
    include: requestInclude,
  });
};

export const findContactRevealRequestById = async (revealRequestId: string) => {
  return db.contactRevealRequest.findUnique({
    where: { id: revealRequestId },
  });
};

export const findActiveReservationForRequest = async (requestId: string) => {
  return db.productReservation.findFirst({
    where: {
      requestId,
      status: 'ACTIVE',
    },
    include: {
      contactRevealRequests: true,
    },
  });
};

export const createContactRevealRequest = async (params: {
  requestId: string;
  reservationId: string;
  requesterId: string;
  targetUserId: string;
}) => {
  return db.contactRevealRequest.create({
    data: {
      requestId: params.requestId,
      reservationId: params.reservationId,
      requesterId: params.requesterId,
      targetUserId: params.targetUserId,
      status: 'PENDING',
    },
  });
};

export const reopenContactRevealRequest = async (revealRequestId: string) => {
  return db.contactRevealRequest.update({
    where: { id: revealRequestId },
    data: {
      status: 'PENDING',
      respondedAt: null,
      respondedById: null,
    },
  });
};

export const respondContactRevealRequest = async (params: {
  revealRequestId: string;
  reservationId: string;
  requestId: string;
  requesterId: string;
  targetUserId: string;
  respondedById: string;
  approve: boolean;
}) => {
  return db.$transaction(async (tx: any) => {
    const txDb = tx as any;
    const now = new Date();

    await txDb.contactRevealRequest.update({
      where: { id: params.revealRequestId },
      data: {
        status: params.approve ? 'APPROVED' : 'REJECTED',
        respondedAt: now,
        respondedById: params.respondedById,
      },
    });

    if (params.approve) {
      const reservation = await txDb.productReservation.findUnique({
        where: { id: params.reservationId },
        select: {
          buyerId: true,
          sellerId: true,
        },
      });

      if (!reservation) {
        throw new AppError('Reservation not found', 404);
      }

      if (
        params.requesterId === reservation.buyerId &&
        params.targetUserId === reservation.sellerId
      ) {
        await txDb.productReservation.update({
          where: { id: params.reservationId },
          data: {
            buyerCanViewSellerContact: true,
            isContactVisible: true,
          },
        });
      } else if (
        params.requesterId === reservation.sellerId &&
        params.targetUserId === reservation.buyerId
      ) {
        await txDb.productReservation.update({
          where: { id: params.reservationId },
          data: {
            sellerCanViewBuyerContact: true,
            isContactVisible: true,
          },
        });
      }
    }

    return txDb.request.findUniqueOrThrow({
      where: { id: params.requestId },
      include: requestInclude,
    });
  });
};

export const createCounterOffer = async (data: CounterOfferRecordInput) => {
  return db.$transaction(async (tx: any) => {
    const txDb = tx as any;

    const request = await txDb.request.findUnique({
      where: { id: data.requestId },
    });

    if (!request) {
      throw new AppError('Request not found', 404);
    }

    if (
      request.status === 'ACCEPTED' ||
      request.status === 'REJECTED' ||
      request.status === 'CANCELLED'
    ) {
      throw new AppError('Request is already closed', 409);
    }

    if (request.expiresAt && request.expiresAt <= new Date()) {
      await txDb.request.update({
        where: { id: request.id },
        data: {
          status: 'EXPIRED',
          cancelledReason: 'EXPIRED',
        },
      });
      throw new AppError('Request has expired', 409);
    }

    if (request.currentTurn !== data.actorRole) {
      throw new AppError('Not your turn to make a counter offer', 409);
    }

    await markActiveOffers(txDb, request.id, 'SUPERSEDED');

    await createOffer(
      txDb,
      request.id,
      data.actorId,
      data.lifecycleVersion,
      data.offerType,
      data.amount,
      data.offeredProducts,
      data.requestedProducts,
    );

    await replaceVisibleProducts(txDb, request.id, data.visibleProducts);

    const nextTurn: RequestTurn = data.actorRole === 'BUYER' ? 'SELLER' : 'BUYER';

    await txDb.request.update({
      where: { id: request.id },
      data: {
        status: 'NEGOTIATING',
        currentTurn: nextTurn,
        message: data.message,
        expiresAt: data.expiresAt,
      },
    });

    return txDb.request.findUniqueOrThrow({
      where: { id: request.id },
      include: requestInclude,
    });
  });
};

export const listOffersForRequest = async (
  requestId: string,
  userId: string,
  order: 'asc' | 'desc' = 'desc',
) => {
  const request = await db.request.findFirst({
    where: {
      id: requestId,
      OR: [{ buyerId: userId }, { sellerId: userId }],
    },
  });

  if (!request) {
    throw new AppError('Request not found', 404);
  }

  const offers = await db.requestOffer.findMany({
    where: { requestId },
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
      requestedProducts: {
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
    orderBy: { createdAt: order },
  });

  return {
    requestId,
    currentTurn: request.currentTurn,
    status: request.status,
    offers,
  };
};

export const acceptActiveOffer = async (
  requestId: string,
  actorId: string,
  actorRole: RequestTurn,
) => {
  return db.$transaction(async (tx: any) => {
    const txDb = tx as any;

    const request = await txDb.request.findUnique({ where: { id: requestId } });
    if (!request) {
      throw new AppError('Request not found', 404);
    }

    if (
      request.status === 'ACCEPTED' ||
      request.status === 'REJECTED' ||
      request.status === 'CANCELLED'
    ) {
      throw new AppError('Request is already closed', 409);
    }

    if (request.currentTurn !== actorRole) {
      throw new AppError('Not your turn to accept', 409);
    }

    const activeOffer = await txDb.requestOffer.findFirst({
      where: {
        requestId,
        status: 'ACTIVE',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!activeOffer) {
      throw new AppError('No active offer found to accept', 409);
    }

    const product = await txDb.product.findUnique({
      where: { id: request.productId },
    });

    if (!product) {
      throw new AppError('Product not found', 404);
    }

    const now = new Date();
    if (product.cooldownUntil && product.cooldownUntil > now) {
      throw new AppError('Product is temporarily disabled due to excessive overrides', 409);
    }

    if (!product.isListed || (product.status !== 'ACTIVE' && product.status !== 'RESERVED')) {
      throw new AppError('Product is not available for acceptance', 409);
    }

    const previousReservation = await txDb.productReservation.findFirst({
      where: { productId: request.productId },
    });

    let nextOverrideCount = product.overrideCount;

    if (
      previousReservation &&
      previousReservation.status === 'ACTIVE' &&
      previousReservation.requestId !== request.id
    ) {
      if (product.overrideCount >= MAX_OVERRIDE_COUNT) {
        const cooldownUntil = new Date(
          now.getTime() + OVERRIDE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000,
        );

        await txDb.product.update({
          where: { id: request.productId },
          data: {
            status: 'REMOVED',
            isListed: false,
            cooldownUntil,
          },
        });

        throw new AppError('Override limit exceeded. Product has been blocked for 7 days', 409);
      }

      await txDb.request.update({
        where: { id: previousReservation.requestId },
        data: {
          status: 'REJECTED',
          cancelledById: actorId,
          cancelledByRole: actorRole,
          cancelledReason: 'OVERRIDDEN',
          acceptedOfferId: null,
        },
      });

      await txDb.requestOffer.updateMany({
        where: {
          requestId: previousReservation.requestId,
          status: 'ACTIVE',
        },
        data: {
          status: 'REJECTED',
        },
      });

      await txDb.transaction.updateMany({
        where: {
          productId: request.productId,
          requestId: previousReservation.requestId,
          status: {
            in: ['INITIATED', 'IN_PROGRESS'],
          },
        },
        data: {
          status: 'CANCELLED',
          cancelledAt: now,
          cancelledReason: 'OVERRIDDEN',
        },
      });

      await txDb.transactionOTP.updateMany({
        where: {
          transaction: {
            productId: request.productId,
            requestId: previousReservation.requestId,
            status: 'CANCELLED',
          },
          verifiedAt: null,
          invalidatedAt: null,
        },
        data: {
          invalidatedAt: now,
        },
      });

      nextOverrideCount = product.overrideCount + 1;

      await txDb.product.update({
        where: { id: request.productId },
        data: {
          overrideCount: nextOverrideCount,
          lastOverrideAt: now,
        },
      });
    }

    await txDb.requestOffer.update({
      where: { id: activeOffer.id },
      data: { status: 'ACCEPTED' },
    });

    await txDb.request.update({
      where: { id: request.id },
      data: {
        status: 'ACCEPTED',
        acceptedOfferId: activeOffer.id,
      },
    });

    const existingReservation = await txDb.productReservation.findFirst({
      where: { productId: request.productId },
    });

    let reservationRecord;

    if (existingReservation) {
      reservationRecord = await txDb.productReservation.update({
        where: { id: existingReservation.id },
        data: {
          requestId: request.id,
          offerId: activeOffer.id,
          buyerId: request.buyerId,
          sellerId: request.sellerId,
          isContactVisible: request.allowProductAccess,
          status: 'ACTIVE',
          cancelledReason: null,
          expiresAt: request.expiresAt,
        },
      });
    } else {
      reservationRecord = await txDb.productReservation.create({
        data: {
          productId: request.productId,
          requestId: request.id,
          offerId: activeOffer.id,
          buyerId: request.buyerId,
          sellerId: request.sellerId,
          isContactVisible: request.allowProductAccess,
          status: 'ACTIVE',
          expiresAt: request.expiresAt,
        },
      });
    }

    const existingTransaction = await txDb.transaction.findFirst({
      where: { reservationId: reservationRecord.id },
    });

    if (existingTransaction) {
      await txDb.transaction.update({
        where: { id: existingTransaction.id },
        data: {
          productId: request.productId,
          requestId: request.id,
          offerId: activeOffer.id,
          buyerId: request.buyerId,
          sellerId: request.sellerId,
          status: 'INITIATED',
          startedAt: null,
          completedAt: null,
          cancelledAt: null,
          cancelledReason: null,
        },
      });
    } else {
      await txDb.transaction.create({
        data: {
          reservationId: reservationRecord.id,
          productId: request.productId,
          requestId: request.id,
          offerId: activeOffer.id,
          buyerId: request.buyerId,
          sellerId: request.sellerId,
          status: 'INITIATED',
        },
      });
    }

    await txDb.transactionOTP.updateMany({
      where: {
        transaction: {
          reservationId: reservationRecord.id,
        },
        verifiedAt: null,
        invalidatedAt: null,
      },
      data: {
        invalidatedAt: now,
      },
    });

    await txDb.product.update({
      where: { id: request.productId },
      data: { status: 'RESERVED' },
    });

    const acceptedRequest = await txDb.request.findUniqueOrThrow({
      where: { id: request.id },
      include: requestInclude,
    });

    return {
      request: acceptedRequest,
      warning:
        nextOverrideCount === LAST_SAFE_OVERRIDE_COUNT
          ? 'Last safe override remaining before cooldown block.'
          : null,
    };
  });
};

const maybeReleaseReservation = async (
  txDb: any,
  requestId: string,
  reason: CancelReason,
  productId: string,
) => {
  const reservation = await txDb.productReservation.findFirst({
    where: { productId },
  });

  if (reservation && reservation.status === 'ACTIVE' && reservation.requestId === requestId) {
    await txDb.productReservation.update({
      where: { id: reservation.id },
      data: {
        status: 'CANCELLED',
        cancelledReason: reason,
      },
    });

    await txDb.product.update({
      where: { id: productId },
      data: {
        status: 'ACTIVE',
      },
    });
  }
};

export const rejectRequest = async (requestId: string, actorId: string, actorRole: RequestTurn) => {
  return db.$transaction(async (tx: any) => {
    const txDb = tx as any;

    const request = await txDb.request.findUnique({ where: { id: requestId } });
    if (!request) {
      throw new AppError('Request not found', 404);
    }

    if (
      request.status === 'ACCEPTED' ||
      request.status === 'REJECTED' ||
      request.status === 'CANCELLED'
    ) {
      throw new AppError('Request is already closed', 409);
    }

    if (request.currentTurn !== actorRole) {
      throw new AppError('Not your turn to reject', 409);
    }

    await markActiveOffers(txDb, request.id, 'REJECTED');

    await txDb.request.update({
      where: { id: request.id },
      data: {
        status: 'REJECTED',
        cancelledById: actorId,
        cancelledByRole: actorRole,
        cancelledReason: 'REJECTED',
      },
    });

    await maybeReleaseReservation(txDb, request.id, 'REJECTED', request.productId);

    return txDb.request.findUniqueOrThrow({
      where: { id: request.id },
      include: requestInclude,
    });
  });
};

export const cancelRequest = async (
  requestId: string,
  actorId: string,
  actorRole: RequestTurn,
  reason: string,
) => {
  return db.$transaction(async (tx: any) => {
    const txDb = tx as any;

    const request = await txDb.request.findUnique({ where: { id: requestId } });
    if (!request) {
      throw new AppError('Request not found', 404);
    }

    if (
      request.status === 'REJECTED' ||
      request.status === 'CANCELLED' ||
      request.status === 'EXPIRED'
    ) {
      throw new AppError('Request is already closed', 409);
    }

    await markActiveOffers(txDb, request.id, 'CANCELLED');

    await txDb.request.update({
      where: { id: request.id },
      data: {
        status: 'CANCELLED',
        cancelledById: actorId,
        cancelledByRole: actorRole,
        cancelledReason: reason,
      },
    });

    await maybeReleaseReservation(txDb, request.id, 'USER_CANCELLED', request.productId);

    const now = new Date();
    await txDb.transaction.updateMany({
      where: {
        requestId: request.id,
        status: { in: ['INITIATED', 'IN_PROGRESS'] },
      },
      data: {
        status: 'CANCELLED',
        cancelledAt: now,
        cancelledReason: 'USER_CANCELLED',
      },
    });

    await txDb.transactionOTP.updateMany({
      where: {
        transaction: {
          requestId: request.id,
          status: 'CANCELLED',
        },
        verifiedAt: null,
        invalidatedAt: null,
      },
      data: {
        invalidatedAt: now,
      },
    });

    return txDb.request.findUniqueOrThrow({
      where: { id: request.id },
      include: requestInclude,
    });
  });
};

const decodeCursor = (cursor?: string) => {
  if (!cursor) return null;
  const decoded = Buffer.from(cursor, 'base64').toString('utf8');
  const [createdAt, id] = decoded.split('|');
  if (!createdAt || !id) {
    return null;
  }
  return { createdAt: new Date(createdAt), id };
};

const buildCursorCondition = (cursor?: string) => {
  const parsed = decodeCursor(cursor);
  if (!parsed) return undefined;
  return {
    OR: [
      { createdAt: { lt: parsed.createdAt } },
      { createdAt: parsed.createdAt, id: { lt: parsed.id } },
    ],
  };
};

const buildLegacyCompletedRequestCondition = () => ({
  status: 'ACCEPTED' as const,
  reservations: {
    some: {
      status: 'COMPLETED' as const,
    },
  },
  transactions: {
    some: {
      status: 'COMPLETED' as const,
    },
  },
});

const buildRequestStatusCondition = (status?: RequestStatus) => {
  if (!status) {
    return undefined;
  }

  if (status === 'COMPLETED') {
    return {
      OR: [{ status: 'COMPLETED' as const }, buildLegacyCompletedRequestCondition()],
    };
  }

  if (status === 'ACCEPTED') {
    return {
      AND: [{ status: 'ACCEPTED' as const }, { NOT: buildLegacyCompletedRequestCondition() }],
    };
  }

  return { status };
};

export const listBuyerRequests = async (
  buyerId: string,
  status: RequestStatus | undefined,
  limit: number,
  cursor?: string,
) => {
  const cursorCondition = buildCursorCondition(cursor);
  const statusCondition = buildRequestStatusCondition(status);
  const conditions = [{ buyerId }, statusCondition, cursorCondition].filter(Boolean);

  return db.request.findMany({
    where: conditions.length === 1 ? conditions[0] : { AND: conditions },
    include: requestInclude,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
  });
};

export const listSellerRequests = async (
  sellerId: string,
  status: RequestStatus | undefined,
  limit: number,
  cursor?: string,
) => {
  const cursorCondition = buildCursorCondition(cursor);
  const statusCondition = buildRequestStatusCondition(status);
  const conditions = [{ sellerId }, statusCondition, cursorCondition].filter(Boolean);

  return db.request.findMany({
    where: conditions.length === 1 ? conditions[0] : { AND: conditions },
    include: requestInclude,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
  });
};
