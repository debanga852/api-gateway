import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config';
import { requestIdMiddleware } from './middleware/requestId.middleware';
import { requestLoggerMiddleware } from './middleware/logger.middleware';
import { errorHandlerMiddleware } from './middleware/errorHandler.middleware';
import { createGatewayRouter } from './routes/gateway.routes';
import adminRouter from './routes/admin/index';

export function createApp(): express.Application {
  const app = express();

  // ── Trust proxy (for correct IP in X-Forwarded-For) ──────────────
  app.set('trust proxy', 1);

  // ── Security headers ──────────────────────────────────────────────
  app.use(helmet());

  // ── CORS ──────────────────────────────────────────────────────────
  app.use(
    cors({
      origin:      config.cors.origins,
      credentials: true,
      methods:     ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Request-ID'],
      exposedHeaders: [
        'X-Request-ID',
        'X-RateLimit-Limit',
        'X-RateLimit-Remaining',
        'X-RateLimit-Reset',
        'X-RateLimit-Window',
        'Retry-After',
        'X-Circuit-Breaker-State',
      ],
    }),
  );

  // ── Body parsers ──────────────────────────────────────────────────
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // ── Request tracing & logging ─────────────────────────────────────
  app.use(requestIdMiddleware);
  app.use(requestLoggerMiddleware);

  // ── Health check (unauthenticated, no rate limit) ─────────────────
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', ts: new Date().toISOString() });
  });

  // ── Admin dashboard API ───────────────────────────────────────────
  app.use('/admin', adminRouter);

  // ── Gateway proxy routes ──────────────────────────────────────────
  app.use('/', createGatewayRouter());

  // ── 404 handler ───────────────────────────────────────────────────
  app.use((_req, res) => {
    res.status(404).json({ error: 'NotFound', message: 'Route not found' });
  });

  // ── Global error boundary ─────────────────────────────────────────
  app.use(errorHandlerMiddleware);

  return app;
}
