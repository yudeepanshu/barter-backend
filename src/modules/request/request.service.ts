import { AppError } from '../../common/errors/AppError';
import * as repo from './request.repository';
import {
  CancelRequestInput,
  CreateCounterOfferInput,
  CreateRequestInput,
  ListRequestsQueryInput,
  RequestContactRevealInput,
  RespondContactRevealInput,
} from './request.schema';

type RequestActorRole = 'BUYER' | 'SELLER';

type OfferInputLike = {
  offerType: 'PRODUCT' | 'MONEY' | 'MIXED' | 'NONE';
  offeredProducts: string[];
  amount?: number;
};

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

const validateOfferShape = (payload: OfferInputLike) => {
  // NONE means no offer attached (only valid for free products — checked separately)
  if (payload.offerType === 'NONE') return;

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

const getActorRoleFromRequest = (
  request: { buyerId: string; sellerId: string },
  userId: string,
): RequestActorRole => {
  if (request.buyerId === userId) {
    return 'BUYER';
  }

  if (request.sellerId === userId) {
    return 'SELLER';
  }

  throw new AppError('Forbidden', 403);
};

const getActiveReservation = (request: any) => {
  const reservations = request?.reservations ?? [];
  return reservations.find((reservation: any) => reservation.status === 'ACTIVE') ?? null;
};

const viewerCanSeeCounterpartyContact = (request: any, actorRole: RequestActorRole) => {
  const reservation = getActiveReservation(request);
  if (!reservation) {
    return false;
  }

  if (reservation.isContactVisible) {
    return true;
  }

  return actorRole === 'BUYER'
    ? Boolean(reservation.buyerCanViewSellerContact)
    : Boolean(reservation.sellerCanViewBuyerContact);
};

const mapRequestForViewer = (request: any, userId: string) => {
  const actorRole = getActorRoleFromRequest(request, userId);
  const reservation = getActiveReservation(request);
  const revealRequests = reservation?.contactRevealRequests ?? [];
  const counterparty = actorRole === 'BUYER' ? request.seller : request.buyer;
  const resolvedStatus =
    request.status === 'ACCEPTED' &&
    (reservation?.status === 'COMPLETED' || request.product?.status === 'EXCHANGED')
      ? 'COMPLETED'
      : request.status;

  const counterpartyContactVisible = viewerCanSeeCounterpartyContact(request, actorRole);
  const viewerRevealRequest = revealRequests.find(
    (reveal: any) => reveal.requesterId === userId && reveal.targetUserId === counterparty.id,
  );
  const incomingPendingReveal = revealRequests.find(
    (reveal: any) =>
      reveal.requesterId === counterparty.id &&
      reveal.targetUserId === userId &&
      reveal.status === 'PENDING',
  );

  const canRequestReveal = Boolean(
    reservation &&
    resolvedStatus === 'ACCEPTED' &&
    request.product?.status === 'RESERVED' &&
    !viewerRevealRequest &&
    !counterpartyContactVisible,
  );

  const sanitizedCounterparty = {
    ...counterparty,
    email: counterpartyContactVisible ? (counterparty.email ?? null) : null,
    mobileNumber: counterpartyContactVisible ? (counterparty.mobileNumber ?? null) : null,
  };

  const sanitizedOffers = (request.offers ?? []).map((offer: any) => {
    if (!offer?.offeredBy || offer.offeredBy.id !== counterparty.id || counterpartyContactVisible) {
      return offer;
    }

    return {
      ...offer,
      offeredBy: {
        ...offer.offeredBy,
        email: null,
        mobileNumber: null,
      },
    };
  });

  return {
    ...request,
    status: resolvedStatus,
    buyer: actorRole === 'BUYER' ? request.buyer : sanitizedCounterparty,
    seller: actorRole === 'SELLER' ? request.seller : sanitizedCounterparty,
    offers: sanitizedOffers,
    contactReveal: {
      reservationId: reservation?.id ?? null,
      canRequestReveal,
      canApproveIncoming: Boolean(incomingPendingReveal),
      viewerRequestStatus: viewerRevealRequest?.status ?? 'NONE',
      incomingRequestId: incomingPendingReveal?.id ?? null,
      incomingRequestStatus: incomingPendingReveal?.status ?? null,
      contactVisible: counterpartyContactVisible,
    },
  };
};

const assertTargetHasContactForApproval = (request: any, targetUserId: string) => {
  const targetUser = request.buyerId === targetUserId ? request.buyer : request.seller;
  const pref = request.contactPreference;

  if (pref === 'PHONE' && !targetUser.mobileNumber) {
    throw new AppError('Please add your phone number in profile before approving reveal', 409);
  }

  if (pref === 'EMAIL' && !targetUser.email) {
    throw new AppError('Please add your email in profile before approving reveal', 409);
  }

  if (pref === 'BOTH' && !targetUser.mobileNumber && !targetUser.email) {
    throw new AppError('Please add phone or email in profile before approving reveal', 409);
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

  if (
    !product.requestByMoney &&
    !product.isFree &&
    (payload.offerType === 'MONEY' || payload.offerType === 'MIXED')
  ) {
    throw new AppError('This product only accepts product-based offers', 400);
  }

  if (!product.isFree && payload.offerType === 'NONE') {
    throw new AppError('An offer is required for this product', 400);
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

  const existingThread = await repo.findRequestThreadByParticipants(
    payload.productId,
    buyerId,
    product.currentOwnerId,
  );

  const request = await repo.upsertRequestThreadWithBuyerOffer({
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
    request: mapRequestForViewer(request, buyerId),
    warning,
    isUpdate: !!existingThread,
    internals: {
      lifecycleVersionSnapshot: product.lifecycleVersion,
      requestStatus: request.status,
      offerStatus: 'ACTIVE',
      currentTurn: request.currentTurn,
    },
  };
};

export const createCounterOffer = async (
  requestId: string,
  payload: CreateCounterOfferInput,
  userId?: string,
) => {
  if (!userId) {
    throw new AppError('Unauthorized', 401);
  }

  validateOfferShape(payload);

  const request = await repo.findRequestByIdForUser(requestId, userId);
  if (!request) {
    throw new AppError('Request not found', 404);
  }

  if (request.expiresAt && request.expiresAt <= new Date()) {
    throw new AppError('Request has expired', 409);
  }

  const actorRole = getActorRoleFromRequest(request, userId);

  if (
    !request.product.requestByMoney &&
    !request.product.isFree &&
    (payload.offerType === 'MONEY' || payload.offerType === 'MIXED')
  ) {
    throw new AppError('This product only accepts product-based offers', 400);
  }

  if (!request.product.isFree && payload.offerType === 'NONE') {
    throw new AppError('An offer is required for this product', 400);
  }

  const allReferencedProducts = [...payload.offeredProducts, ...payload.visibleProducts];
  if (allReferencedProducts.includes(request.productId)) {
    throw new AppError(
      'Requested product cannot be reused inside offer/visibility product lists',
      400,
    );
  }

  await validateOwnership(userId, payload.offeredProducts, 'offeredProducts');
  await validateOwnership(userId, payload.visibleProducts, 'visibleProducts');

  const expiresAt = new Date(Date.now() + payload.expiresInHours * 60 * 60 * 1000);

  const updated = await repo.createCounterOffer({
    requestId,
    actorId: userId,
    actorRole,
    lifecycleVersion: request.lifecycleVersion,
    offerType: payload.offerType,
    amount: payload.amount,
    offeredProducts: payload.offeredProducts,
    visibleProducts: payload.visibleProducts,
    message: payload.message,
    expiresAt,
  });

  return {
    request: mapRequestForViewer(updated, userId),
    internals: {
      requestStatus: updated.status,
      currentTurn: updated.currentTurn,
      action: 'COUNTERED',
    },
  };
};

export const acceptRequest = async (requestId: string, userId?: string) => {
  if (!userId) {
    throw new AppError('Unauthorized', 401);
  }

  const request = await repo.findRequestByIdForUser(requestId, userId);
  if (!request) {
    throw new AppError('Request not found', 404);
  }

  const actorRole = getActorRoleFromRequest(request, userId);
  const result = await repo.acceptActiveOffer(requestId, userId, actorRole);

  return {
    request: mapRequestForViewer(result.request, userId),
    warning: result.warning,
    internals: {
      requestStatus: result.request.status,
      action: 'ACCEPTED',
    },
  };
};

export const rejectRequest = async (requestId: string, userId?: string) => {
  if (!userId) {
    throw new AppError('Unauthorized', 401);
  }

  const request = await repo.findRequestByIdForUser(requestId, userId);
  if (!request) {
    throw new AppError('Request not found', 404);
  }

  const actorRole = getActorRoleFromRequest(request, userId);
  const updated = await repo.rejectRequest(requestId, userId, actorRole);

  return {
    request: mapRequestForViewer(updated, userId),
    internals: {
      requestStatus: updated.status,
      action: 'REJECTED',
    },
  };
};

export const cancelRequest = async (
  requestId: string,
  payload: CancelRequestInput,
  userId?: string,
) => {
  if (!userId) {
    throw new AppError('Unauthorized', 401);
  }

  const request = await repo.findRequestByIdForUser(requestId, userId);
  if (!request) {
    throw new AppError('Request not found', 404);
  }

  const actorRole = getActorRoleFromRequest(request, userId);
  const updated = await repo.cancelRequest(requestId, userId, actorRole, payload.reason);

  return {
    request: mapRequestForViewer(updated, userId),
    internals: {
      requestStatus: updated.status,
      action: 'CANCELLED',
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

  return mapRequestForViewer(request, userId);
};

export const getRequestOffers = async (requestId: string, userId?: string) => {
  if (!userId) {
    throw new AppError('Unauthorized', 401);
  }

  return repo.listOffersForRequest(requestId, userId);
};

export const getSentRequests = async (query: ListRequestsQueryInput, userId?: string) => {
  if (!userId) {
    throw new AppError('Unauthorized', 401);
  }

  const results = await repo.listBuyerRequests(userId, query.status, query.limit, query.cursor);
  const mapped = results.map((request: any) => mapRequestForViewer(request, userId));
  return buildPaginatedResponse(mapped, query.limit);
};

export const getReceivedRequests = async (query: ListRequestsQueryInput, userId?: string) => {
  if (!userId) {
    throw new AppError('Unauthorized', 401);
  }

  const results = await repo.listSellerRequests(userId, query.status, query.limit, query.cursor);
  const mapped = results.map((request: any) => mapRequestForViewer(request, userId));
  return buildPaginatedResponse(mapped, query.limit);
};

export const requestContactReveal = async (
  requestId: string,
  _payload: RequestContactRevealInput,
  userId?: string,
) => {
  if (!userId) {
    throw new AppError('Unauthorized', 401);
  }

  const request = await repo.findRequestByIdForUser(requestId, userId);
  if (!request) {
    throw new AppError('Request not found', 404);
  }

  if (request.status !== 'ACCEPTED' || request.product.status !== 'RESERVED') {
    throw new AppError('Contact reveal is only available for accepted reserved requests', 409);
  }

  const reservation = getActiveReservation(request);
  if (!reservation) {
    throw new AppError('No active reservation found for this request', 409);
  }

  const actorRole = getActorRoleFromRequest(request, userId);
  const targetUserId = actorRole === 'BUYER' ? request.sellerId : request.buyerId;

  const alreadyVisible = viewerCanSeeCounterpartyContact(request, actorRole);
  if (alreadyVisible) {
    throw new AppError('Contact info is already revealed', 409);
  }

  const existingRequest = reservation.contactRevealRequests.find(
    (reveal: any) => reveal.requesterId === userId && reveal.targetUserId === targetUserId,
  );
  if (existingRequest) {
    throw new AppError('You can request contact reveal only once for this reservation', 409);
  }

  await repo.createContactRevealRequest({
    requestId,
    reservationId: reservation.id,
    requesterId: userId,
    targetUserId,
  });

  const refreshed = await repo.findRequestByIdForUser(requestId, userId);
  if (!refreshed) {
    throw new AppError('Request not found', 404);
  }

  return {
    request: mapRequestForViewer(refreshed, userId),
  };
};

export const respondContactReveal = async (
  requestId: string,
  revealRequestId: string,
  payload: RespondContactRevealInput,
  userId?: string,
) => {
  if (!userId) {
    throw new AppError('Unauthorized', 401);
  }

  const request = await repo.findRequestByIdForUser(requestId, userId);
  if (!request) {
    throw new AppError('Request not found', 404);
  }

  const reservation = getActiveReservation(request);
  if (!reservation) {
    throw new AppError('No active reservation found for this request', 409);
  }

  const revealRequest = reservation.contactRevealRequests.find(
    (reveal: any) => reveal.id === revealRequestId,
  );
  if (!revealRequest) {
    throw new AppError('Reveal request not found', 404);
  }

  if (revealRequest.targetUserId !== userId) {
    throw new AppError('Only the target user can respond to this reveal request', 403);
  }

  if (revealRequest.status !== 'PENDING') {
    throw new AppError('Reveal request is already resolved', 409);
  }

  if (payload.approve) {
    assertTargetHasContactForApproval(request, userId);
  }

  const updated = await repo.respondContactRevealRequest({
    revealRequestId,
    reservationId: reservation.id,
    requestId,
    requesterId: revealRequest.requesterId,
    targetUserId: revealRequest.targetUserId,
    respondedById: userId,
    approve: payload.approve,
  });

  return {
    request: mapRequestForViewer(updated, userId),
  };
};
