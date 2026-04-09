import { DomainEvent, DomainEventPayloadMap, DomainEventType } from '../eventTypes';

/**
 * Port for event dispatch backends (in-process, Redis, etc).
 * Allows swapping implementations without changing domain code.
 */
export interface IEventDispatcher {
  subscribe<T extends DomainEventType>(
    eventType: T,
    handler: (event: DomainEvent<T>) => void | Promise<void>,
  ): () => void;

  publish<T extends DomainEventType>(
    eventType: T,
    payload: DomainEventPayloadMap[T],
  ): Promise<void>;

  publishEvent<T extends DomainEventType>(event: DomainEvent<T>): Promise<void>;
}

/**
 * Port for realtime gateway implementations (Socket.IO, etc).
 * Allows swapping transports without changing event code.
 */
export interface IRealtimeGateway {
  emitToUsers(userIds: string[], event: any): void;
  emitToRoom(roomName: string, event: any): void;
  close(): void;
}
