import { Server as HttpServer } from 'http';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { Server, Socket } from 'socket.io';

import { config } from '../config/env';
import { logger } from '../config/logger';
import { isUserParticipantInRequest } from '../modules/request/request.repository';
import { isUserParticipantInTransaction } from '../modules/transaction/transaction.repository';

type SocketAuthUser = {
  id: string;
};

type SocketRealtimeEvent = {
  eventId: string;
  type: string;
  occurredAt: string;
  payload: Record<string, unknown>;
};

const parseUserFromToken = (token: string): SocketAuthUser | null => {
  try {
    const decoded = jwt.verify(token, config.ACCESS_SECRET) as JwtPayload | string;
    if (typeof decoded === 'string' || typeof decoded.id !== 'string') {
      return null;
    }

    return { id: decoded.id };
  } catch {
    return null;
  }
};

const parseBearerToken = (authorization?: string): string | null => {
  if (!authorization) {
    return null;
  }

  const [scheme, value] = authorization.split(' ');
  if (scheme !== 'Bearer' || !value) {
    return null;
  }

  return value;
};

const getAllowedOrigins = () => {
  const parsedOrigins = config.CORS_ORIGIN.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (parsedOrigins.length === 0 || parsedOrigins.includes('*')) {
    return '*';
  }

  return parsedOrigins;
};

export const getUserRoom = (userId: string) => `user:${userId}`;
export const getRequestRoom = (requestId: string) => `request:${requestId}`;
export const getProductRoom = (productId: string) => `product:${productId}`;
export const getTransactionRoom = (transactionId: string) => `transaction:${transactionId}`;

class SocketManager {
  private io: Server | null = null;

  initialize(httpServer: HttpServer) {
    if (this.io) {
      return this.io;
    }

    this.io = new Server(httpServer, {
      cors: {
        origin: getAllowedOrigins(),
        credentials: true,
      },
    });

    this.io.use((socket, next) => {
      const authToken =
        typeof socket.handshake.auth?.token === 'string' ? socket.handshake.auth.token : null;
      const bearerToken = parseBearerToken(socket.handshake.headers.authorization);
      const token = authToken || bearerToken;

      if (!token) {
        return next(new Error('UNAUTHORIZED'));
      }

      const user = parseUserFromToken(token);
      if (!user) {
        return next(new Error('UNAUTHORIZED'));
      }

      socket.data.user = user;
      next();
    });

    this.io.on('connection', (socket) => {
      this.handleConnection(socket).catch((error) => {
        logger.warn('Socket connection setup failed', {
          reason: error instanceof Error ? error.message : 'unknown',
        });
      });
    });

    return this.io;
  }

  private async handleConnection(socket: Socket) {
    const user = socket.data.user as SocketAuthUser;
    socket.join(getUserRoom(user.id));

    socket.on('realtime:join:product', (payload: { productId?: string }) => {
      if (!payload?.productId) {
        return;
      }
      socket.join(getProductRoom(payload.productId));
    });

    socket.on('realtime:leave:product', (payload: { productId?: string }) => {
      if (!payload?.productId) {
        return;
      }
      socket.leave(getProductRoom(payload.productId));
    });

    socket.on('realtime:join:request', async (payload: { requestId?: string }) => {
      if (!payload?.requestId) {
        return;
      }

      const allowed = await isUserParticipantInRequest(payload.requestId, user.id);
      if (!allowed) {
        return;
      }

      socket.join(getRequestRoom(payload.requestId));
    });

    socket.on('realtime:leave:request', (payload: { requestId?: string }) => {
      if (!payload?.requestId) {
        return;
      }

      socket.leave(getRequestRoom(payload.requestId));
    });

    socket.on('realtime:join:transaction', async (payload: { transactionId?: string }) => {
      if (!payload?.transactionId) {
        return;
      }

      const allowed = await isUserParticipantInTransaction(payload.transactionId, user.id);
      if (!allowed) {
        return;
      }

      socket.join(getTransactionRoom(payload.transactionId));
    });

    socket.on('realtime:leave:transaction', (payload: { transactionId?: string }) => {
      if (!payload?.transactionId) {
        return;
      }

      socket.leave(getTransactionRoom(payload.transactionId));
    });
  }

  emitToUsers(userIds: string[], event: SocketRealtimeEvent) {
    if (!this.io || userIds.length === 0) {
      return;
    }

    const uniqueUserIds = [...new Set(userIds)];
    uniqueUserIds.forEach((userId) => {
      this.io?.to(getUserRoom(userId)).emit('realtime:event', event);
    });
  }

  emitToRoom(roomName: string, event: SocketRealtimeEvent) {
    if (!this.io) {
      return;
    }

    this.io.to(roomName).emit('realtime:event', event);
  }

  close() {
    if (!this.io) {
      return;
    }

    this.io.close();
    this.io = null;
  }
}

export const socketManager = new SocketManager();
