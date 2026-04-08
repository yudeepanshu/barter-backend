import { AppError } from '../../common/errors/AppError';
import { API_ERROR_CODES } from '../../common/constants/apiResponses';
import * as repo from './request.repository';
import { logger } from '../../config/logger';
import { dispatchNotificationToUser } from '../notification/notification.service';
import {
  CancelRequestInput,
  CreateCounterOfferInput,
  CreateRequestInput,
  ListRequestOffersQueryInput,
  ListRequestsQueryInput,
  RequestContactRevealInput,
  RespondContactRevealInput,
} from './request.schema';

type RequestActorRole = 'BUYER' | 'SELLER';

type OfferInputLike = {
  offerType: 'PRODUCT' | 'MONEY' | 'MIXED' | 'NONE';
  offeredProducts: string[];
  requestedProducts?: string[];
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
      throw new AppError(API_ERROR_CODES.OFFER_PRODUCTS_REQUIRED, 400);
    }
    if (hasAmount) {
      throw new AppError(API_ERROR_CODES.OFFER_AMOUNT_NOT_ALLOWED_FOR_PRODUCT, 400);
    }
  }

  if (payload.offerType === 'MONEY') {
    if (!hasAmount) {
      throw new AppError(API_ERROR_CODES.OFFER_AMOUNT_REQUIRED_FOR_MONEY, 400);
    }
    if (offeredCount > 0) {
      throw new AppError(API_ERROR_CODES.OFFER_PRODUCTS_NOT_ALLOWED_FOR_MONEY, 400);
    }
  }

  if (payload.offerType === 'MIXED') {
    if (!hasAmount || offeredCount === 0) {
      throw new AppError(API_ERROR_CODES.OFFER_MIXED_REQUIRES_AMOUNT_AND_PRODUCTS, 400);
    }
  }
};

const validateCounterOfferShape = (
  payload: CreateCounterOfferInput,
  actorRole: RequestActorRole,
) => {
  if (payload.offerType === 'NONE') return;

  const offeredCount = payload.offeredProducts.length;
  const requestedCount = payload.requestedProducts.length;
  const hasAmount = payload.amount != null;

  if (actorRole === 'SELLER' && offeredCount > 0) {
    throw new AppError(API_ERROR_CODES.COUNTER_OFFER_SELLER_OWN_LISTINGS, 400);
  }

  if (payload.offerType === 'PRODUCT') {
    if (actorRole === 'SELLER') {
      if (requestedCount === 0) {
        throw new AppError(API_ERROR_CODES.OFFER_REQUESTED_PRODUCTS_REQUIRED, 400);
      }
      if (hasAmount) {
        throw new AppError(API_ERROR_CODES.OFFER_AMOUNT_NOT_ALLOWED_FOR_PRODUCT, 400);
      }
      return;
    }

    if (offeredCount === 0) {
      throw new AppError(API_ERROR_CODES.OFFER_PRODUCTS_REQUIRED, 400);
    }
    if (hasAmount) {
      throw new AppError(API_ERROR_CODES.OFFER_AMOUNT_NOT_ALLOWED_FOR_PRODUCT, 400);
    }
  }

  if (payload.offerType === 'MONEY') {
    if (!hasAmount) {
      throw new AppError(API_ERROR_CODES.OFFER_AMOUNT_REQUIRED_FOR_MONEY, 400);
    }
    if (offeredCount > 0 || requestedCount > 0) {
      throw new AppError(API_ERROR_CODES.OFFER_PRODUCT_LISTS_NOT_ALLOWED_FOR_MONEY, 400);
    }
  }

  if (payload.offerType === 'MIXED') {
    if (!hasAmount) {
      throw new AppError(API_ERROR_CODES.OFFER_MIXED_REQUIRES_AMOUNT, 400);
    }

    if (actorRole === 'SELLER') {
      if (requestedCount === 0) {
        throw new AppError(API_ERROR_CODES.OFFER_MIXED_REQUIRES_AMOUNT_AND_REQUESTED_PRODUCTS, 400);
      }
      return;
    }

    if (offeredCount === 0) {
      throw new AppError(API_ERROR_CODES.OFFER_MIXED_REQUIRES_AMOUNT_AND_PRODUCTS, 400);
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

  throw new AppError(API_ERROR_CODES.FORBIDDEN, 403);
};

const getActiveReservation = (request: any) => {
  const reservations = request?.reservations ?? [];
  return reservations.find((reservation: any) => reservation.status === 'ACTIVE') ?? null;
};

const getCompletedReservation = (request: any) => {
  const reservations = request?.reservations ?? [];
  const completedReservations = reservations
    .filter((reservation: any) => reservation.status === 'COMPLETED')
    .sort(
      (left: any, right: any) =>
        new Date(right.updatedAt ?? right.createdAt ?? 0).getTime() -
        new Date(left.updatedAt ?? left.createdAt ?? 0).getTime(),
    );

  return completedReservations[0] ?? null;
};

const getCompletedTransaction = (request: any) => {
  const transactions = request?.transactions ?? [];
  const completedTransactions = transactions
    .filter((transaction: any) => transaction.status === 'COMPLETED')
    .sort(
      (left: any, right: any) =>
        new Date(right.completedAt ?? right.updatedAt ?? right.createdAt ?? 0).getTime() -
        new Date(left.completedAt ?? left.updatedAt ?? left.createdAt ?? 0).getTime(),
    );

  return completedTransactions[0] ?? null;
};

const getStatusReservation = (request: any) => {
  const activeReservation = getActiveReservation(request);
  if (activeReservation) {
    return activeReservation;
  }

  return getCompletedReservation(request);
};

const isLegacyCompletedRequest = (request: any) => {
  return Boolean(
    request.status === 'ACCEPTED' &&
    getCompletedReservation(request) &&
    getCompletedTransaction(request),
  );
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
  const reservation = getStatusReservation(request);
  const revealRequests = reservation?.contactRevealRequests ?? [];
  const counterparty = actorRole === 'BUYER' ? request.seller : request.buyer;
  const resolvedStatus = isLegacyCompletedRequest(request) ? 'COMPLETED' : request.status;

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
    viewerRevealRequest?.status !== 'PENDING' &&
    !incomingPendingReveal &&
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
    throw new AppError(API_ERROR_CODES.REVEAL_MISSING_PHONE, 409);
  }

  if (pref === 'EMAIL' && !targetUser.email) {
    throw new AppError(API_ERROR_CODES.REVEAL_MISSING_EMAIL, 409);
  }

  if (pref === 'BOTH' && !targetUser.mobileNumber && !targetUser.email) {
    throw new AppError(API_ERROR_CODES.REVEAL_MISSING_CONTACT, 409);
  }
};

export const createRequest = async (payload: CreateRequestInput, buyerId?: string) => {
  if (!buyerId) {
    throw new AppError(API_ERROR_CODES.UNAUTHORIZED, 401);
  }

  validateOfferShape(payload);

  const product = await repo.findProductById(payload.productId);
  if (!product) {
    throw new AppError(API_ERROR_CODES.PRODUCT_NOT_FOUND, 404);
  }

  if (product.currentOwnerId === buyerId) {
    throw new AppError(API_ERROR_CODES.REQUEST_OWN_PRODUCT, 400);
  }

  if (
    !product.requestByMoney &&
    !product.isFree &&
    (payload.offerType === 'MONEY' || payload.offerType === 'MIXED')
  ) {
    throw new AppError(API_ERROR_CODES.PRODUCT_ONLY_ACCEPTS_PRODUCT_OFFERS, 400);
  }

  if (
    product.requestByMoney &&
    payload.amount != null &&
    Number(product.minMoneyAmount) > 0 &&
    payload.amount < Number(product.minMoneyAmount)
  ) {
    throw new AppError(
      `Offer amount must be at least \u20b9${Number(product.minMoneyAmount)}`,
      400,
    );
  }

  if (!product.isFree && payload.offerType === 'NONE') {
    throw new AppError(API_ERROR_CODES.OFFER_REQUIRED, 400);
  }

  const now = new Date();
  const isRequestableStatus = product.status === 'ACTIVE' || product.status === 'RESERVED';
  if (
    !isRequestableStatus ||
    !product.isListed ||
    (product.cooldownUntil && product.cooldownUntil > now)
  ) {
    throw new AppError(API_ERROR_CODES.PRODUCT_NOT_AVAILABLE_FOR_REQUESTS, 409);
  }

  const allReferencedProducts = [...payload.offeredProducts, ...payload.visibleProducts];
  if (allReferencedProducts.includes(payload.productId)) {
    throw new AppError(API_ERROR_CODES.PRODUCT_REUSED_IN_OFFER_LIST, 400);
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

  dispatchNotificationToUser({
    userId: product.currentOwnerId,
    type: 'REQUEST_CREATED',
    title: 'New request received',
    body: `${request.buyer.userName} requested your listing ${product.title}`,
    data: {
      requestId: request.id,
      productId: product.id,
      buyerId: buyerId,
      buyerName: request.buyer.userName,
    },
  }).catch((error) => {
    logger.warn('Failed to dispatch request-created notification', {
      requestId: request.id,
      sellerId: product.currentOwnerId,
      reason: error instanceof Error ? error.message : 'unknown',
    });
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
    throw new AppError(API_ERROR_CODES.UNAUTHORIZED, 401);
  }

  const request = await repo.findRequestByIdForUser(requestId, userId);
  if (!request) {
    throw new AppError(API_ERROR_CODES.REQUEST_NOT_FOUND, 404);
  }

  if (request.expiresAt && request.expiresAt <= new Date()) {
    throw new AppError(API_ERROR_CODES.REQUEST_EXPIRED, 409);
  }

  const actorRole = getActorRoleFromRequest(request, userId);
  validateCounterOfferShape(payload, actorRole);

  if (
    !request.product.requestByMoney &&
    !request.product.isFree &&
    (payload.offerType === 'MONEY' || payload.offerType === 'MIXED')
  ) {
    throw new AppError(API_ERROR_CODES.PRODUCT_ONLY_ACCEPTS_PRODUCT_OFFERS, 400);
  }

  if (actorRole === 'BUYER' && request.product.requestByMoney && payload.amount != null) {
    const productMin = Number(request.product.minMoneyAmount);
    const sellerOfferAmounts = (request.offers ?? [])
      .filter(
        (offer: any) =>
          offer.offeredById === request.sellerId &&
          offer.status !== 'CANCELLED' &&
          offer.offeredAmount != null,
      )
      .map((offer: any) => Number(offer.offeredAmount));
    const lowestSellerOffer =
      sellerOfferAmounts.length > 0 ? Math.min(...sellerOfferAmounts) : null;
    const effectiveMin =
      productMin > 0
        ? lowestSellerOffer != null
          ? Math.min(productMin, lowestSellerOffer)
          : productMin
        : null;

    if (effectiveMin != null && payload.amount < effectiveMin) {
      throw new AppError(`Offer amount must be at least \u20b9${effectiveMin}`, 400);
    }
  }

  if (!request.product.isFree && payload.offerType === 'NONE') {
    throw new AppError(API_ERROR_CODES.OFFER_REQUIRED, 400);
  }

  const allReferencedProducts = [
    ...payload.offeredProducts,
    ...payload.visibleProducts,
    ...payload.requestedProducts,
  ];
  if (allReferencedProducts.includes(request.productId)) {
    throw new AppError(API_ERROR_CODES.PRODUCT_REUSED_IN_OFFER_LIST, 400);
  }

  await validateOwnership(userId, payload.offeredProducts, 'offeredProducts');
  await validateOwnership(userId, payload.visibleProducts, 'visibleProducts');
  const counterpartyId = actorRole === 'BUYER' ? request.sellerId : request.buyerId;
  await validateOwnership(counterpartyId, payload.requestedProducts, 'requestedProducts');

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
    requestedProducts: payload.requestedProducts,
    message: payload.message,
    expiresAt,
  });

  dispatchNotificationToUser({
    userId: counterpartyId,
    type: 'REQUEST_COUNTERED',
    title: 'New counter offer',
    body: `${updated.offers[updated.offers.length - 1]?.offeredBy?.userName ?? 'Someone'} sent a counter offer on ${updated.product.title}`,
    data: {
      requestId: updated.id,
      productId: updated.productId,
      actorId: userId,
      actorRole,
    },
  }).catch((error) => {
    logger.warn('Failed to dispatch counter-offer notification', {
      requestId: updated.id,
      receiverId: counterpartyId,
      reason: error instanceof Error ? error.message : 'unknown',
    });
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
    throw new AppError(API_ERROR_CODES.UNAUTHORIZED, 401);
  }

  const request = await repo.findRequestByIdForUser(requestId, userId);
  if (!request) {
    throw new AppError(API_ERROR_CODES.REQUEST_NOT_FOUND, 404);
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
    throw new AppError(API_ERROR_CODES.UNAUTHORIZED, 401);
  }

  const request = await repo.findRequestByIdForUser(requestId, userId);
  if (!request) {
    throw new AppError(API_ERROR_CODES.REQUEST_NOT_FOUND, 404);
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
    throw new AppError(API_ERROR_CODES.UNAUTHORIZED, 401);
  }

  const request = await repo.findRequestByIdForUser(requestId, userId);
  if (!request) {
    throw new AppError(API_ERROR_CODES.REQUEST_NOT_FOUND, 404);
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
    throw new AppError(API_ERROR_CODES.UNAUTHORIZED, 401);
  }

  const request = await repo.findRequestByIdForUser(requestId, userId);
  if (!request) {
    throw new AppError(API_ERROR_CODES.REQUEST_NOT_FOUND, 404);
  }

  return mapRequestForViewer(request, userId);
};

export const getRequestOffers = async (
  requestId: string,
  query: ListRequestOffersQueryInput,
  userId?: string,
) => {
  if (!userId) {
    throw new AppError(API_ERROR_CODES.UNAUTHORIZED, 401);
  }

  return repo.listOffersForRequest(requestId, userId, query.order);
};

export const getSentRequests = async (query: ListRequestsQueryInput, userId?: string) => {
  if (!userId) {
    throw new AppError(API_ERROR_CODES.UNAUTHORIZED, 401);
  }

  const results = await repo.listBuyerRequests(userId, query.status, query.limit, query.cursor);
  const mapped = results.map((request: any) => mapRequestForViewer(request, userId));
  return buildPaginatedResponse(mapped, query.limit);
};

export const getReceivedRequests = async (query: ListRequestsQueryInput, userId?: string) => {
  if (!userId) {
    throw new AppError(API_ERROR_CODES.UNAUTHORIZED, 401);
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
    throw new AppError(API_ERROR_CODES.UNAUTHORIZED, 401);
  }

  const request = await repo.findRequestByIdForUser(requestId, userId);
  if (!request) {
    throw new AppError(API_ERROR_CODES.REQUEST_NOT_FOUND, 404);
  }

  if (request.status !== 'ACCEPTED' || request.product.status !== 'RESERVED') {
    throw new AppError(API_ERROR_CODES.CONTACT_REVEAL_NOT_AVAILABLE, 409);
  }

  const reservation = getActiveReservation(request);
  if (!reservation) {
    throw new AppError(API_ERROR_CODES.NO_ACTIVE_RESERVATION, 409);
  }

  const actorRole = getActorRoleFromRequest(request, userId);
  const targetUserId = actorRole === 'BUYER' ? request.sellerId : request.buyerId;

  const alreadyVisible = viewerCanSeeCounterpartyContact(request, actorRole);
  if (alreadyVisible) {
    throw new AppError(API_ERROR_CODES.CONTACT_ALREADY_REVEALED, 409);
  }

  const existingRequest = reservation.contactRevealRequests.find(
    (reveal: any) => reveal.requesterId === userId && reveal.targetUserId === targetUserId,
  );
  if (existingRequest) {
    if (existingRequest.status === 'PENDING') {
      throw new AppError(API_ERROR_CODES.CONTACT_REVEAL_ALREADY_PENDING, 409);
    }

    if (existingRequest.status === 'APPROVED') {
      throw new AppError(API_ERROR_CODES.CONTACT_ALREADY_REVEALED, 409);
    }

    await repo.reopenContactRevealRequest(existingRequest.id);
  } else {
    await repo.createContactRevealRequest({
      requestId,
      reservationId: reservation.id,
      requesterId: userId,
      targetUserId,
    });
  }

  const refreshed = await repo.findRequestByIdForUser(requestId, userId);
  if (!refreshed) {
    throw new AppError(API_ERROR_CODES.REQUEST_NOT_FOUND, 404);
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
    throw new AppError(API_ERROR_CODES.UNAUTHORIZED, 401);
  }

  const request = await repo.findRequestByIdForUser(requestId, userId);
  if (!request) {
    throw new AppError(API_ERROR_CODES.REQUEST_NOT_FOUND, 404);
  }

  const reservation = getActiveReservation(request);
  if (!reservation) {
    throw new AppError(API_ERROR_CODES.NO_ACTIVE_RESERVATION, 409);
  }

  const revealRequest = reservation.contactRevealRequests.find(
    (reveal: any) => reveal.id === revealRequestId,
  );
  if (!revealRequest) {
    throw new AppError(API_ERROR_CODES.REVEAL_REQUEST_NOT_FOUND, 404);
  }

  if (revealRequest.targetUserId !== userId) {
    throw new AppError(API_ERROR_CODES.REVEAL_REQUEST_NOT_TARGET, 403);
  }

  if (revealRequest.status !== 'PENDING') {
    throw new AppError(API_ERROR_CODES.REVEAL_REQUEST_ALREADY_RESOLVED, 409);
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
