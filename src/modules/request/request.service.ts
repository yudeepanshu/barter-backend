import { AppError } from '../../common/errors/AppError';
import * as repo from './request.repository';
import { CreateRequestInput, ListRequestsQueryInput } from './request.schema';

const encodeCursor = (createdAt: Date, id: string) => {
  return Buffer.from(`${createdAt.toISOString()}|${id}`, 'utf8').toString('base64');
};

const buildPaginatedResponse = <T extends { createdAt: Date; id: string }>(
  items: T[],
  limit: number,
) => {
  const hasMore = items.length > limit;
  const pagedItems = hasMore ? items.slice(0, limit) : items;
  const nextCursor =
    hasMore && pagedItems.length > 0
      ? encodeCursor(
          pagedItems[pagedItems.length - 1].createdAt,
          pagedItems[pagedItems.length - 1].id,
        )
      : null;

  return {
    items: pagedItems,
    nextCursor,
    hasMore,
  };
};

const validateOfferShape = (payload: CreateRequestInput) => {
  const offeredCount = payload.offeredProducts.length;
  const hasAmount = payload.amount != null;

  if (payload.offerType === 'PRODUCT') {
    if (offeredCount === 0) {
      throw new AppError('offeredProducts is required for PRODUCT offer type', 400);
    }
    if (hasAmount) {
      throw new AppError('amount is not allowed for PRODUCT offer type', 400);
    }
  }

  if (payload.offerType === 'MONEY') {
    if (!hasAmount) {
      throw new AppError('amount is required for MONEY offer type', 400);
    }
    if (offeredCount > 0) {
      throw new AppError('offeredProducts is not allowed for MONEY offer type', 400);
    }
  }

  if (payload.offerType === 'MIXED') {
    if (!hasAmount || offeredCount === 0) {
      throw new AppError('MIXED offer type requires both amount and offeredProducts', 400);
    }
  }
};

const validateOwnership = async (userId: string, productIds: string[], label: string) => {
  if (productIds.length === 0) {
    return;
  }

  const owned = await repo.findOwnedProductsByIds(userId, productIds);
  if (owned.length !== productIds.length) {
    throw new AppError(`${label} must contain only your active listed products`, 400);
  }
};

export const createRequest = async (payload: CreateRequestInput, buyerId?: string) => {
  if (!buyerId) {
    throw new AppError('Unauthorized', 401);
  }

  validateOfferShape(payload);

  const product = await repo.findProductById(payload.productId);
  if (!product) {
    throw new AppError('Product not found', 404);
  }

  if (product.currentOwnerId === buyerId) {
    throw new AppError('You cannot request your own product', 400);
  }

  const now = new Date();
  const isRequestableStatus = product.status === 'ACTIVE' || product.status === 'RESERVED';
  if (
    !isRequestableStatus ||
    !product.isListed ||
    (product.cooldownUntil && product.cooldownUntil > now)
  ) {
    throw new AppError('Product is not available for requests', 409);
  }

  const allReferencedProducts = [...payload.offeredProducts, ...payload.visibleProducts];
  if (allReferencedProducts.includes(payload.productId)) {
    throw new AppError(
      'Requested product cannot be reused inside offer/visibility product lists',
      400,
    );
  }

  await validateOwnership(buyerId, payload.offeredProducts, 'offeredProducts');
  await validateOwnership(buyerId, payload.visibleProducts, 'visibleProducts');

  const warning =
    product.status === 'RESERVED'
      ? 'This product is currently reserved by another buyer. You can still place your request to compete with a better offer.'
      : null;

  const expiresAt = new Date(now.getTime() + payload.expiresInHours * 60 * 60 * 1000);

  // Check for existing open request
  const existingRequest = await repo.findExistingOpenRequest(
    payload.productId,
    buyerId,
    product.currentOwnerId,
  );
  const isUpdate = !!existingRequest;

  const request = await repo.createRequestWithOffer({
    productId: payload.productId,
    buyerId,
    sellerId: product.currentOwnerId,
    lifecycleVersion: product.lifecycleVersion,
    allowProductAccess: payload.allowProductAccess,
    message: payload.message,
    contactPreference: payload.contactPreference,
    expiresAt,
    offerType: payload.offerType,
    amount: payload.amount,
    offeredProducts: payload.offeredProducts,
    visibleProducts: payload.visibleProducts,
  });

  return {
    request,
    warning,
    isUpdate,
    internals: {
      lifecycleVersionSnapshot: product.lifecycleVersion,
      requestStatus: isUpdate ? 'UPDATED' : 'CREATED',
      offerStatus: 'ACTIVE',
    },
  };
};

export const getRequestById = async (requestId: string, userId?: string) => {
  if (!userId) {
    throw new AppError('Unauthorized', 401);
  }

  const request = await repo.findRequestByIdForUser(requestId, userId);
  if (!request) {
    throw new AppError('Request not found', 404);
  }

  return request;
};

export const getSentRequests = async (query: ListRequestsQueryInput, userId?: string) => {
  if (!userId) {
    throw new AppError('Unauthorized', 401);
  }

  const results = await repo.listBuyerRequests(userId, query.status, query.limit, query.cursor);
  return buildPaginatedResponse(results, query.limit);
};

export const getReceivedRequests = async (query: ListRequestsQueryInput, userId?: string) => {
  if (!userId) {
    throw new AppError('Unauthorized', 401);
  }

  const results = await repo.listSellerRequests(userId, query.status, query.limit, query.cursor);
  return buildPaginatedResponse(results, query.limit);
};
