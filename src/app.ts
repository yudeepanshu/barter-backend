import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { logger } from './config/logger';
import { config } from './config/env';
import routes from './routes/index';
import { errorHandler } from './common/middlewares/errorHandler';
import { sendError, sendSuccess } from './common/utils/responseHandler';
import { API_ERROR_CODES, API_SUCCESS_CODES } from './common/constants/apiResponses';
import { apiLimiter } from './common/middlewares/rateLimiter';
import { requestContext } from './common/middlewares/requestContext';
import { sanitizeInput } from './common/middlewares/sanitize';

const app: Application = express();

// ============================================================
// FIX #2: HTTPS/TLS ENFORCEMENT (Production Only)
// ============================================================
// 🔒 WHY: Forces all traffic through encrypted HTTPS
// Without this, data sent over HTTP is visible to attackers
// 📝 WHAT: Redirects HTTP requests to HTTPS, adds security headers
if (config.NODE_ENV === 'production') {
  // Redirect HTTP → HTTPS
  app.use((req, res, next) => {
    const proto = req.header('x-forwarded-proto') || req.protocol;
    if (proto !== 'https') {
      return res.redirect(301, `https://${req.header('host')}${req.originalUrl}`);
    }
    next();
  });

  logger.info('🔒 HTTPS enforced: HTTP requests will be redirected to HTTPS');
}

// ============================================================
// FIX #2b: Security Headers via Helmet
// ============================================================
// Headers added by helmet (are already there):
// - Strict-Transport-Security: HSTS - Force all future requests to HTTPS
// - X-Content-Type-Options: nosniff - Prevent MIME sniffing
// - X-Frame-Options: DENY - Don't allow embedding in iframe
// - X-XSS-Protection: Enable XSS filters
const parsedOrigins = config.CORS_ORIGIN.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOptions =
  parsedOrigins.length === 0 || parsedOrigins.includes('*') ? {} : { origin: parsedOrigins };

app.use(helmet());
app.use(cors(corsOptions));
app.use(requestContext);

// ============================================================
// FIX #3: REQUEST SIZE & TIMEOUT LIMITS
// ============================================================
// 🔒 WHY: Prevents DoS attacks using huge payloads or slow connections
// 📝 LIMITS:
//   - Body size: 1MB (enough for normal requests, blocks payload bombs)
//   - URL: 10KB (standard URLs are <2KB)
//   - Request timeout: 30s production, 60s dev (hangs blocked)
//
// Example attack without limits:
//   Attacker sends 1GB JSON body → Server runs out of memory → Crash
//
// Example attack we're preventing:
//   Attacker sends: {"title":"x", "description":"10GB of repeated text..."}
//   With limit: Rejected at 1MB ✓
//
app.use(
  express.json({
    limit: '1mb', // Maximum body size
  }),
);

app.use(
  express.urlencoded({
    limit: '1mb',
    extended: true,
  }),
);

// ============================================================
// INPUT SANITIZATION
// ============================================================
// 🔒 WHY: Body parsing (above) gives us raw user input. Before any
// validator or controller sees it, we strip null bytes, trim strings,
// and collapse duplicate query params (HPP). See sanitize.ts for detail.
//
// ORDER MATTERS: must run AFTER express.json/urlencoded (body is parsed)
// and BEFORE routes/rate-limiters (they read req.body and req.query).
app.use(sanitizeInput);

// Request timeout: If client doesn't send complete request in X seconds, kill it
// Prevents "slow-read" attacks where attacker sends 1 byte/second to exhaust connections
app.use((req, res, next) => {
  const timeoutMs = config.NODE_ENV === 'production' ? 30000 : 60000;
  req.setTimeout(timeoutMs); // Node.js request timeout
  res.setTimeout(timeoutMs); // Response timeout

  // Handle timeout errors
  const onTimeout = () => {
    logger.warn('Request timeout', {
      method: req.method,
      url: req.url,
      ip: req.ip,
      timeoutMs,
    });
    if (!res.headersSent) {
      res.status(408).json({
        success: false,
        code: 'REQUEST_TIMEOUT',
        message: 'Request took too long to complete',
      });
    }
  };

  req.on('timeout', onTimeout);
  res.on('timeout', onTimeout);

  next();
});

logger.info('✓ Request limits configured', {
  maxBodySize: '1MB',
  timeout: `${config.NODE_ENV === 'production' ? 30 : 60}s`,
});

// ============================================================
// FIX #4: GENERAL RATE LIMITING
// ============================================================
// 🔒 WHY: Prevents brute force, DoS, spam
// 📝 APPLIED TO:
//   - All API routes globally
//   - Per IP: 100 requests per minute
//   - Can make more specific limiters per route (see auth routes)
//
// Example: Without rate limiting
//   for (let i = 0; i < 10000; i++) {
//     fetch('/api/auth/request-otp'); // 10,000 OTP requests in 1 second!
//   }
//
// With rate limiting:
//   First 100 requests: ✓ OK
//   101st request: ✗ BLOCKED (error 429 Too Many Requests)
//
app.use('/api', apiLimiter);

logger.info('⏱️  Rate limiting enabled on /api routes - Max 100 requests per minute per IP');
app.use((req, _res, next) => {
  logger.info('Incoming request', {
    requestId: req.requestId,
    method: req.method,
    url: req.url,
    ip: req.ip,
  });
  next();
});

app.use('/api', routes);

app.get('/health', (_req, res) =>
  sendSuccess(res, { status: 'ok' }, API_SUCCESS_CODES.SERVER_HEALTH_OK),
);

app.use((_req, res) => {
  sendError(res, API_ERROR_CODES.NOT_FOUND, 404);
});

app.use(errorHandler);

export default app;
