import { Request, Response, NextFunction } from 'express';
import rateLimiterService from '../services/rateLimiter.service';
import metricsService from '../services/metrics.service';
import { AuthenticatedRequest, RateLimitResult } from '../types';
import logger from '../utils/logger';

declare module 'express' {
  interface Response {
    locals: {
      rateLimit?: RateLimitResult;
    };
  }
}

/**
 * Sliding-window rate limit middleware.
 * Checks per-IP, then per-user, then per-apiKey in order.
 * Attaches result to res.locals.rateLimit for downstream use.
 */
export async function rateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authReq = req as AuthenticatedRequest;

  // Check manual IP block first (instant reject)
  const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
  const isBlocked = await rateLimiterService.isBlocked(ip);

  if (isBlocked) {
    logger.warn('[RateLimit] Blocked IP attempted access', { ip, path: req.path });

    await metricsService.record({
      requestId:   authReq.requestId,
      serviceId:   'gateway',
      method:      req.method,
      path:        req.path,
      statusCode:  429,
      latencyMs:   0,
      bytesIn:     0,
      bytesOut:    0,
      timestamp:   Date.now(),
      ip,
      rateLimited: true,
      circuitOpen: false,
    });

    res.status(429).json({
      error:   'Too Many Requests',
      message: 'Your IP has been blocked',
    });
    return;
  }

  const context = {
    ip,
    userId: authReq.user?.sub,
    apiKey: authReq.user?.apiKey ?? (req.headers['x-api-key'] as string),
  };

  const result = await rateLimiterService.check(context);

  // Set standard rate limit headers
  res.setHeader('X-RateLimit-Limit',     String(result.limit));
  res.setHeader('X-RateLimit-Remaining', String(result.remaining));
  res.setHeader('X-RateLimit-Reset',     String(Math.ceil(result.resetAtMs / 1000)));
  res.setHeader('X-RateLimit-Window',    result.windowType);

  if (!result.allowed) {
    res.setHeader('Retry-After', String(result.retryAfterSeconds));

    logger.warn('[RateLimit] Request rejected', {
      windowType: result.windowType,
      ip,
      userId:  context.userId,
      current: result.current,
      limit:   result.limit,
    });

    await metricsService.record({
      requestId:   authReq.requestId,
      serviceId:   'gateway',
      method:      req.method,
      path:        req.path,
      statusCode:  429,
      latencyMs:   0,
      bytesIn:     0,
      bytesOut:    0,
      timestamp:   Date.now(),
      ip,
      userId:      context.userId,
      rateLimited: true,
      circuitOpen: false,
    });

    res.status(429).json({
      error:              'Too Many Requests',
      message:            `Rate limit exceeded (${result.windowType} limit)`,
      limit:              result.limit,
      current:            result.current,
      retryAfterSeconds:  result.retryAfterSeconds,
    });
    return;
  }

  res.locals.rateLimit = result;
  next();
}
