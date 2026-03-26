import prisma from '../../config/db';

// NOTE: VS Code can lag behind prisma generate for brand-new models.
// Use a local alias to avoid false red squiggles while preserving runtime behavior.
const db = prisma as any;

type RequestStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';
type OfferType = 'PRODUCT' | 'MONEY' | 'MIXED';
type ContactPreference = 'PHONE' | 'EMAIL' | 'BOTH';

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
    orderBy: { createdAt: 'desc' as const },
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
};

export const findProductById = async (productId: string) => {
  return prisma.product.findUnique({
    where: { id: productId },
    include: { owner: true },
  });
};

export const findOwnedProductsByIds = async (ownerId: string, productIds: string[]) => {
  if (productIds.length === 0) {
    return [];
  }

  return prisma.product.findMany({
    where: {
      id: { in: productIds },
      currentOwnerId: ownerId,
      isListed: true,
      status: 'ACTIVE',
    },
    select: { id: true },
  });
};

export const findExistingOpenRequest = async (
  productId: string,
  buyerId: string,
  sellerId: string,
) => {
  return db.request.findFirst({
    where: {
      productId,
      buyerId,
      sellerId,
      status: 'PENDING',
    },
  });
};

export const createRequestWithOffer = async (data: CreateRequestRecordInput) => {
  return prisma.$transaction(async (tx) => {
    const txDb = tx as any;

    // Check if request already exists
    const existingRequest = await txDb.request.findFirst({
      where: {
        productId: data.productId,
        buyerId: data.buyerId,
        sellerId: data.sellerId,
        status: 'PENDING',
      },
    });

    let request: any;
    if (existingRequest) {
      // Update existing request
      request = await txDb.request.update({
        where: { id: existingRequest.id },
        data: {
          allowProductAccess: data.allowProductAccess,
          message: data.message,
          contactPreference: data.contactPreference,
          lifecycleVersion: data.lifecycleVersion,
          expiresAt: data.expiresAt,
          updateCount: { increment: 1 },
        },
      });

      // Update the existing offer
      const existingOffer = await txDb.requestOffer.findFirst({
        where: {
          requestId: existingRequest.id,
          status: 'ACTIVE',
        },
      });

      if (existingOffer) {
        await txDb.requestOffer.update({
          where: { id: existingOffer.id },
          data: {
            offeredAmount: data.amount,
            lifecycleVersion: data.lifecycleVersion,
          },
        });

        // Delete old products and recreate
        await txDb.requestOfferProduct.deleteMany({
          where: { offerId: existingOffer.id },
        });

        if (data.offeredProducts.length > 0) {
          await txDb.requestOfferProduct.createMany({
            data: data.offeredProducts.map((productId) => ({
              offerId: existingOffer.id,
              productId,
            })),
          });
        }
      }

      // Delete old visible products and recreate
      await txDb.requestVisibleProduct.deleteMany({
        where: { requestId: existingRequest.id },
      });

      if (data.visibleProducts.length > 0) {
        await txDb.requestVisibleProduct.createMany({
          data: data.visibleProducts.map((productId) => ({
            requestId: existingRequest.id,
            productId,
          })),
        });
      }
    } else {
      // Create new request
      request = await txDb.request.create({
        data: {
          productId: data.productId,
          buyerId: data.buyerId,
          sellerId: data.sellerId,
          status: 'PENDING',
          allowProductAccess: data.allowProductAccess,
          message: data.message,
          contactPreference: data.contactPreference,
          lifecycleVersion: data.lifecycleVersion,
          expiresAt: data.expiresAt,
        },
      });

      const offer = await txDb.requestOffer.create({
        data: {
          requestId: request.id,
          offeredById: data.buyerId,
          lifecycleVersion: data.lifecycleVersion,
          type: data.offerType,
          offeredAmount: data.amount,
          status: 'ACTIVE',
        },
      });

      if (data.offeredProducts.length > 0) {
        await txDb.requestOfferProduct.createMany({
          data: data.offeredProducts.map((productId) => ({
            offerId: offer.id,
            productId,
          })),
        });
      }

      if (data.visibleProducts.length > 0) {
        await txDb.requestVisibleProduct.createMany({
          data: data.visibleProducts.map((productId) => ({
            requestId: request.id,
            productId,
          })),
        });
      }
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
