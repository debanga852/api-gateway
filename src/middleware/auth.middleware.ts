import { Request, Response, NextFunction } from 'express';
import authService from '../services/auth.service';
import { AuthenticatedRequest } from '../types';
import logger from '../utils/logger';

/**
 * Optional JWT middleware — attaches req.user if a valid Bearer token is present.
 * Does NOT reject unauthenticated requests; use requireAuth for that.
 */
export async function jwtMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const authReq = req as AuthenticatedRequest;
  const header  = req.headers.authorization;

  if (!header?.startsWith('Bearer ')) {
    return next();
  }

  const token = header.slice(7);

  try {
    authReq.user = await authService.verifyToken(token);
  } catch (err) {
    logger.debug('[Auth] Invalid token', { err: (err as Error).message });
    // Silently ignore — route handler or requireAuth will reject if needed
  }

  next();
}

/**
 * Enforces authentication. Use after jwtMiddleware on protected routes.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authReq = req as AuthenticatedRequest;

  if (!authReq.user) {
    res.status(401).json({ error: 'Unauthorized', message: 'Valid Bearer token required' });
    return;
  }

  next();
}
