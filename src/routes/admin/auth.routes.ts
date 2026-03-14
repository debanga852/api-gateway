import { Router } from 'express';
import { config } from '../../config';
import authService from '../../services/auth.service';
import { asyncHandler } from '../../utils/asyncHandler';

const router = Router();

/**
 * POST /admin/auth/login
 * Returns an admin JWT on valid credentials.
 */
router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { username, password } = req.body as { username?: string; password?: string };

    if (!username || !password) {
      res.status(400).json({ error: 'BadRequest', message: 'username and password required' });
      return;
    }

    if (username !== config.admin.username || password !== config.admin.password) {
      res.status(401).json({ error: 'Unauthorized', message: 'Invalid credentials' });
      return;
    }

    const token      = authService.issueAdminToken(username);
    const decoded    = authService.verifyAdminToken(token);
    const expiresAt  = decoded.exp * 1000;

    res.json({ token, expiresAt });
  }),
);

/**
 * POST /admin/auth/token
 * Issue a gateway JWT (for testing routes that require auth).
 */
router.post(
  '/token',
  asyncHandler(async (req, res) => {
    const { userId, role, apiKey } = req.body as {
      userId?: string;
      role?:   'user' | 'admin' | 'service';
      apiKey?: string;
    };

    if (!userId) {
      res.status(400).json({ error: 'BadRequest', message: 'userId required' });
      return;
    }

    const token = authService.issueToken(userId, role ?? 'user', apiKey);
    res.json({ token });
  }),
);

export default router;
