import { Router } from 'express';
import { adminAuthMiddleware } from '../../middleware/adminAuth.middleware';
import authRoutes          from './auth.routes';
import metricsRoutes       from './metrics.routes';
import circuitBreakerRoutes from './circuitBreaker.routes';
import rateLimitRoutes     from './rateLimit.routes';
import redisService        from '../../services/redis.service';
import metricsService      from '../../services/metrics.service';
import circuitBreakerService from '../../services/circuitBreaker.service';

const router = Router();

// Auth routes are public (login endpoint)
router.use('/auth', authRoutes);

// All other admin routes require admin JWT
router.use(adminAuthMiddleware);

router.use('/metrics',          metricsRoutes);
router.use('/circuit-breakers', circuitBreakerRoutes);
router.use('/rate-limits',      rateLimitRoutes);

/**
 * GET /admin/health
 * Gateway health check (Redis ping, uptime, service states).
 */
router.get('/health', async (_req, res) => {
  const [redisOk, summary, services, cbs] = await Promise.all([
    redisService.ping(),
    metricsService.getGlobalSummary(),
    metricsService.getAllServiceHealth(),
    circuitBreakerService.getAllSnapshots(),
  ]);

  res.json({
    status:    redisOk ? 'healthy' : 'degraded',
    redis:     redisOk ? 'connected' : 'disconnected',
    uptimeMs:  summary.uptimeMs,
    services,
    circuitBreakers: cbs,
    global:    summary,
  });
});

export default router;
