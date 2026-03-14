import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AuthenticatedRequest } from '../types';

/**
 * Attaches a unique X-Request-ID to every request.
 * Uses existing header if already present (for tracing across services).
 */
export function requestIdMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const authReq      = req as AuthenticatedRequest;
  authReq.requestId  = (req.headers['x-request-id'] as string) ?? uuidv4();
  authReq.startTime  = Date.now();

  _res.setHeader('X-Request-ID', authReq.requestId);
  next();
}
