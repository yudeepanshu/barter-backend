import { randomUUID } from 'crypto';

export type RequestAction =
  | 'CREATED'
  | 'COUNTERED'
  | 'ACCEPTED'
  | 'COMPLETED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'CONTACT_REVEAL_REQUESTED'
  | 'CONTACT_REVEAL_RESPONDED';

export type ProductAction =
  | 'CREATED'
  | 'UPDATED'
  | 'RELISTED'
  | 'REMOVED'
  | 'RESERVED'
  | 'EXCHANGED'
  | 'OWNERSHIP_TRANSFERRED'
  | 'IMAGES_UPDATED';

export type TransactionAction =
  | 'INITIATED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'OTP_EXPIRED'
  | 'OTP_INVALIDATED';

export type NotificationAction = 'CREATED' | 'READ' | 'READ_ALL' | 'CLEARED_ALL';

export type DomainEventPayloadMap = {
  'request.updated': {
    requestId: string;
    productId: string;
    buyerId: string;
    sellerId: string;
    status: string;
    currentTurn: string | null;
    message?: string | null;
    action: RequestAction;
    actorId?: string;
  };
  'product.updated': {
    productId: string;
    ownerId: string;
    actorId?: string;
    status: string;
    isListed: boolean;
    action: ProductAction;
    relatedRequestId?: string;
    relatedTransactionId?: string;
  };
  'transaction.updated': {
    transactionId: string;
    requestId: string;
    productId: string;
    buyerId: string;
    sellerId: string;
    status: string;
    action: TransactionAction;
    actorId?: string;
  };
  'notification.updated': {
    userId: string;
    action: NotificationAction;
    notificationId?: string;
    notificationType?: string;
    unreadCount?: number;
    actorId?: string;
  };
};

export type DomainEventType = keyof DomainEventPayloadMap;

export type DomainEvent<T extends DomainEventType = DomainEventType> = {
  eventId: string;
  type: T;
  occurredAt: string;
  payload: DomainEventPayloadMap[T];
};

export const createDomainEvent = <T extends DomainEventType>(
  type: T,
  payload: DomainEventPayloadMap[T],
): DomainEvent<T> => ({
  eventId: randomUUID(),
  type,
  occurredAt: new Date().toISOString(),
  payload,
});
