import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

import redis from '../../config/redis';
import { sendError } from '../utils/responseHandler';
import { auditFromRequest } from '../services/auditLogger';

const IDEMPOTENCY_TTL_SECONDS = 10 * 60;
const HEADER_NAME = 'x-idempotency-key';

const buildPayloadHash = (body: unknown) => {
  const raw = JSON.stringify(body ?? {});
  return crypto.createHash('sha256').update(raw).digest('hex');
};

/**
 * Replay protection for mutation endpoints.
 *
 * Rules:
 * - Requires an idempotency key header from client.
 * - Same key + same user + same route + same payload => returns existing result window (409).
 * - Same key but different payload => treated as invalid idempotency usage (409).
 */
export const enforceIdempotency = async (req: Request, res: Response, next: NextFunction) => {
  const idempotencyKey = req.header(HEADER_NAME);
  const userId = req.user?.id;

  if (!userId) {
    return sendError(res, 'Unauthorized', 401);
  }

  if (!idempotencyKey || idempotencyKey.trim().length < 8) {
    return sendError(res, 'Idempotency key is required', 400);
  }

  const normalizedKey = idempotencyKey.trim();
  const routeKey = `${req.method}:${req.baseUrl}${req.route?.path ?? req.path}`;
  const payloadHash = buildPayloadHash(req.body);
  const redisKey = `idem:${userId}:${routeKey}:${normalizedKey}`;

  const existingHash = await redis.get(redisKey);
  if (existingHash) {
    if (existingHash !== payloadHash) {
      auditFromRequest(req, {
        action: 'AUTH_IDEMPOTENCY_BLOCK',
        outcome: 'BLOCKED',
        reason: 'idempotency key reused with different payload',
        details: {
          routeKey,
        },
      });

      return sendError(res, 'Idempotency key reuse with different payload is not allowed', 409);
    }

    auditFromRequest(req, {
      action: 'AUTH_IDEMPOTENCY_BLOCK',
      outcome: 'BLOCKED',
      reason: 'duplicate idempotent request',
      details: {
        routeKey,
      },
    });

    return sendError(
      res,
      'Duplicate request detected. Please retry with a new idempotency key',
      409,
    );
  }

  const setResult = await redis.set(redisKey, payloadHash, 'EX', IDEMPOTENCY_TTL_SECONDS, 'NX');
  if (setResult !== 'OK') {
    auditFromRequest(req, {
      action: 'AUTH_IDEMPOTENCY_BLOCK',
      outcome: 'BLOCKED',
      reason: 'idempotency lock already exists',
      details: {
        routeKey,
      },
    });

    return sendError(
      res,
      'Duplicate request detected. Please retry with a new idempotency key',
      409,
    );
  }

  return next();
};
