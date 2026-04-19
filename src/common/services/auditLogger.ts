import { Request } from 'express';

import { logger } from '../../config/logger';

export type SecurityAuditOutcome = 'SUCCESS' | 'FAILURE' | 'BLOCKED';

export type SecurityAuditAction =
  | 'AUTH_OTP_REQUEST'
  | 'AUTH_OTP_VERIFY'
  | 'AUTH_GOOGLE_LOGIN'
  | 'AUTH_REFRESH_TOKEN'
  | 'AUTH_LOGOUT'
  | 'AUTH_ADMIN_ACCESS'
  | 'AUTH_RATE_LIMIT_OTP'
  | 'AUTH_IDEMPOTENCY_BLOCK';

type BaseAuditMeta = {
  action: SecurityAuditAction;
  outcome: SecurityAuditOutcome;
  requestId?: string;
  userId?: string;
  ip?: string;
  method?: string;
  path?: string;
  reason?: string;
  details?: Record<string, unknown>;
};

const getIp = (req: Request) => req.ip || req.socket?.remoteAddress || '0.0.0.0';

export const auditFromRequest = (
  req: Request,
  event: Omit<BaseAuditMeta, 'requestId' | 'userId' | 'ip' | 'method' | 'path'>,
) => {
  const payload: BaseAuditMeta = {
    ...event,
    requestId: req.requestId,
    userId: req.user?.id,
    ip: getIp(req),
    method: req.method,
    path: `${req.baseUrl}${req.path}`,
  };

  logger.info('SECURITY_AUDIT', payload);
};

export const auditSecurityEvent = (event: BaseAuditMeta) => {
  logger.info('SECURITY_AUDIT', event);
};
