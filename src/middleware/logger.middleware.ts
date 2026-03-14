import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import logger from '../utils/logger';

/**
 * HTTP request/response logger.
 * Logs on response finish so we capture status code and latency.
 */
export function requestLoggerMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const authReq = req as AuthenticatedRequest;

  res.on('finish', () => {
    const latencyMs = Date.now() - (authReq.startTime ?? Date.now());
    const level     = res.statusCode >= 500 ? 'error'
                    : res.statusCode >= 400 ? 'warn'
                    : 'info';

    logger[level]('HTTP', {
      requestId:  authReq.requestId,
      method:     req.method,
      path:       req.originalUrl,
      status:     res.statusCode,
      latencyMs,
      ip:         req.ip,
      userId:     authReq.user?.sub,
      userAgent:  req.headers['user-agent'],
    });
  });

  next();
}
