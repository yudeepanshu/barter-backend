import { eventDispatcher } from './eventDispatcher';
import {
  getProductRoom,
  getRequestRoom,
  getTransactionRoom,
  socketManager,
} from '../sockets/socketManager';

let initialized = false;

export const registerRealtimeSubscribers = () => {
  if (initialized) {
    return;
  }

  initialized = true;

  eventDispatcher.subscribe('request.updated', async (event) => {
    socketManager.emitToUsers([event.payload.buyerId, event.payload.sellerId], event);
    socketManager.emitToRoom(getRequestRoom(event.payload.requestId), event);
  });

  eventDispatcher.subscribe('product.updated', async (event) => {
    socketManager.emitToUsers([event.payload.ownerId], event);
    socketManager.emitToRoom(getProductRoom(event.payload.productId), event);
  });

  eventDispatcher.subscribe('transaction.updated', async (event) => {
    socketManager.emitToUsers([event.payload.buyerId, event.payload.sellerId], event);
    socketManager.emitToRoom(getTransactionRoom(event.payload.transactionId), event);
  });

  eventDispatcher.subscribe('notification.updated', async (event) => {
    socketManager.emitToUsers([event.payload.userId], event);
  });
};
