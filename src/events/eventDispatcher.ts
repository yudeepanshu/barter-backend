import { logger } from '../config/logger';
import {
  createDomainEvent,
  DomainEvent,
  DomainEventPayloadMap,
  DomainEventType,
} from './eventTypes';
import { IEventDispatcher } from './ports/eventDispatcher';

type DomainEventHandler<T extends DomainEventType> = (
  event: DomainEvent<T>,
) => void | Promise<void>;

type SubscriberRegistry = {
  [K in DomainEventType]: Set<DomainEventHandler<K>>;
};

const createRegistry = (): SubscriberRegistry => ({
  'request.updated': new Set(),
  'product.updated': new Set(),
  'transaction.updated': new Set(),
  'notification.updated': new Set(),
});

export class EventDispatcher implements IEventDispatcher {
  private subscribers: SubscriberRegistry = createRegistry();

  subscribe<T extends DomainEventType>(eventType: T, handler: DomainEventHandler<T>): () => void {
    this.subscribers[eventType].add(handler as never);

    return () => {
      this.subscribers[eventType].delete(handler as never);
    };
  }

  async publish<T extends DomainEventType>(
    eventType: T,
    payload: DomainEventPayloadMap[T],
  ): Promise<void> {
    const event = createDomainEvent(eventType, payload);
    await this.publishEvent(event);
  }

  async publishEvent<T extends DomainEventType>(event: DomainEvent<T>): Promise<void> {
    const handlers = Array.from(this.subscribers[event.type]);
    if (handlers.length === 0) {
      return;
    }

    const settled = await Promise.allSettled(
      handlers.map((handler) => Promise.resolve(handler(event as never))),
    );

    settled.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        return;
      }

      logger.warn('Event handler failed', {
        eventType: event.type,
        eventId: event.eventId,
        handlerIndex: index,
        reason: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    });
  }
}

export const eventDispatcher = new EventDispatcher();
