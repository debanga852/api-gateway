import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

export interface AppError extends Error {
  statusCode?: number;
  code?:       string;
}

/**
 * Global Express error boundary.
 * Catches anything passed to next(err).
 */
export function errorHandlerMiddleware(
  err:  AppError,
  req:  Request,
  res:  Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  const statusCode = err.statusCode ?? 500;
  const isDev      = process.env.NODE_ENV !== 'production';

  logger.error('[ErrorHandler]', {
    message: err.message,
    code:    err.code,
    stack:   isDev ? err.stack : undefined,
    path:    req.originalUrl,
    method:  req.method,
  });

  res.status(statusCode).json({
    error:   err.code  ?? 'InternalServerError',
    message: err.message ?? 'An unexpected error occurred',
    ...(isDev ? { stack: err.stack } : {}),
  });
}
