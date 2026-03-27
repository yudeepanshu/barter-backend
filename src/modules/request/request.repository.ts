import { AppError } from '../../common/errors/AppError';
import prisma from '../../config/db';

// NOTE: VS Code can lag behind prisma generate for brand-new models.
// Use local aliases to avoid false red squiggles while preserving runtime behavior.
const db = prisma as any;

type RequestStatus = 'PENDING' | 'NEGOTIATING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED';
type OfferType = 'PRODUCT' | 'MONEY' | 'MIXED' | 'NONE';
type ContactPreference = 'PHONE' | 'EMAIL' | 'BOTH';
type RequestTurn = 'BUYER' | 'SELLER';
type OfferStatus = 'ACTIVE' | 'SUPERSEDED' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';
type CancelReason = 'USER_CANCELLED' | 'EXPIRED' | 'OVERRIDDEN' | 'REJECTED';

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
  message?: string;
  expiresAt: Date;
};

const requestInclude = {
  product: {
    include: {
      productImages: true,
      category: true,
    },
  },
  buyer: true,
  seller: true,
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
  reservations: true,
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

export const listOffersForRequest = async (requestId: string, userId: string) => {
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
    },
    orderBy: { createdAt: 'asc' },
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

    const previousReservation = await txDb.productReservation.findFirst({
      where: { productId: request.productId },
    });

    if (
      previousReservation &&
      previousReservation.status === 'ACTIVE' &&
      previousReservation.requestId !== request.id
    ) {
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

    if (existingReservation) {
      await txDb.productReservation.update({
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
      await txDb.productReservation.create({
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

    await txDb.product.update({
      where: { id: request.productId },
      data: { status: 'RESERVED' },
    });

    return txDb.request.findUniqueOrThrow({
      where: { id: request.id },
      include: requestInclude,
    });
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

export const listBuyerRequests = async (
  buyerId: string,
  status: RequestStatus | undefined,
  limit: number,
  cursor?: string,
) => {
  const cursorCondition = buildCursorCondition(cursor);

  return db.request.findMany({
    where: {
      buyerId,
      ...(status ? { status } : {}),
      ...(cursorCondition ? { AND: [cursorCondition] } : {}),
    },
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

  return db.request.findMany({
    where: {
      sellerId,
      ...(status ? { status } : {}),
      ...(cursorCondition ? { AND: [cursorCondition] } : {}),
    },
    include: requestInclude,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
  });
};
