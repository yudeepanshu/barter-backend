import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { logger } from './config/logger';
import { config } from './config/env';
import routes from './routes/index';
import { errorHandler } from './common/middlewares/errorHandler';
import { sendError, sendSuccess } from './common/utils/responseHandler';
import { API_ERROR_CODES, API_SUCCESS_CODES } from './common/constants/apiResponses';

const app: Application = express();

const parsedOrigins = config.CORS_ORIGIN.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOptions =
  parsedOrigins.length === 0 || parsedOrigins.includes('*') ? {} : { origin: parsedOrigins };

app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json());
app.use((req, _res, next) => {
  logger.info('Incoming request', { method: req.method, url: req.url });
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
