import { Redis } from 'ioredis';
import { logger } from '../../config/logger';
import {
  createDomainEvent,
  DomainEvent,
  DomainEventPayloadMap,
  DomainEventType,
} from '../eventTypes';
import { IEventDispatcher } from '../ports/eventDispatcher';

/**
 * Redis-backed event dispatcher for horizontal scaling.
 *
 * When running multiple server instances:
 * - Each instance publishes events to Redis Pub/Sub channel per event type
 * - Each instance subscribes to Redis channels and routes to local event handlers
 * - Local WebSocket clients receive events routed by socket.io-redis adapter
 *
 * Usage in future:
 * ```typescript
 * const redisDispatcher = new RedisEventDispatcher(
 *   redis,
 *   new InProcessEventDispatcher() // Fallback for local handlers
 * );
 * ```
 *
 * Benefits:
 * - Events published on instance A reach instance B's subscribers
 * - No code changes to domain services (IEventDispatcher interface unchanged)
 * - Supports eventual consistency patterns (event sourcing, outbox)
 */
export class RedisEventDispatcher implements IEventDispatcher {
  private redisSubscriber: Redis;
  private redisPublisher: Redis;
  private localDispatcher: IEventDispatcher;
  private subscribed = false;

  constructor(redisClient: Redis, localDispatcher: IEventDispatcher) {
    this.redisPublisher = redisClient;
    this.redisSubscriber = redisClient.duplicate();
    this.localDispatcher = localDispatcher;
    this.setupRedisSubscriptions();
  }

  private setupRedisSubscriptions() {
    if (this.subscribed) {
      return;
    }

    this.subscribed = true;

    const eventTypes: DomainEventType[] = [
      'request.updated',
      'product.updated',
      'transaction.updated',
      'notification.updated',
    ];

    eventTypes.forEach((eventType) => {
      const channelName = `events:${eventType}`;

      this.redisSubscriber.subscribe(channelName, (err, count) => {
        if (err) {
          logger.error('Failed to subscribe to Redis channel', {
            channel: channelName,
            reason: err.message,
          });
          return;
        }

        logger.info('Subscribed to Redis event channel', {
          channel: channelName,
          subscriptionCount: count,
        });
      });
    });

    this.redisSubscriber.on('message', async (channel, message) => {
      try {
        const event = JSON.parse(message) as DomainEvent;
        // Re-emit locally to trigger all subscribers
        await this.localDispatcher.publishEvent(event);
      } catch (error) {
        logger.error('Failed to process Redis event message', {
          channel,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    });
  }

  subscribe<T extends DomainEventType>(
    eventType: T,
    handler: (event: DomainEvent<T>) => void | Promise<void>,
  ): () => void {
    // Subscribe locally (events from Redis will also reach here via message handler)
    return this.localDispatcher.subscribe(eventType, handler);
  }

  async publish<T extends DomainEventType>(
    eventType: T,
    payload: DomainEventPayloadMap[T],
  ): Promise<void> {
    const event = createDomainEvent(eventType, payload);
    await this.publishEvent(event);
  }

  async publishEvent<T extends DomainEventType>(event: DomainEvent<T>): Promise<void> {
    const channelName = `events:${event.type}`;
    const message = JSON.stringify(event);

    // Publish to Redis for other instances
    await this.redisPublisher.publish(channelName, message);

    // Also emit locally so this instance's handlers run immediately
    await this.localDispatcher.publishEvent(event);
  }

  close() {
    this.redisSubscriber.disconnect();
  }
}
