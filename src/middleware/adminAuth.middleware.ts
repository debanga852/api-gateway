import { Request, Response, NextFunction } from 'express';
import authService from '../services/auth.service';
import logger from '../utils/logger';

/**
 * Validates admin JWT for all /admin/* routes.
 * Uses a separate secret from gateway JWTs.
 */
export function adminAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;

  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized', message: 'Admin token required' });
    return;
  }

  const token = header.slice(7);

  try {
    const payload = authService.verifyAdminToken(token);

    if (payload.role !== 'admin') {
      res.status(403).json({ error: 'Forbidden', message: 'Admin role required' });
      return;
    }

    // Attach to request for logging purposes
    (req as Request & { admin: typeof payload }).admin = payload;
    next();
  } catch (err) {
    logger.warn('[AdminAuth] Invalid token', { err: (err as Error).message });
    res.status(401).json({ error: 'Unauthorized', message: 'Invalid or expired admin token' });
  }
}
