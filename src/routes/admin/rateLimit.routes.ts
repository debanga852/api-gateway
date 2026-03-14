import { Router } from 'express';
import rateLimiterService from '../../services/rateLimiter.service';
import metricsService from '../../services/metrics.service';
import { asyncHandler } from '../../utils/asyncHandler';

const router = Router();

/**
 * GET /admin/rate-limits/config
 * Current rate limit tiers.
 */
router.get(
  '/config',
  asyncHandler(async (_req, res) => {
    const cfg = await rateLimiterService.getRateLimitConfig();
    res.json(cfg);
  }),
);

/**
 * GET /admin/rate-limits/stats
 * Top blocked IPs and aggregate stats.
 */
router.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    const [topBlockedIPs, summary] = await Promise.all([
      metricsService.getTopBlockedIPs(10),
      metricsService.getGlobalSummary(),
    ]);

    res.json({
      topBlockedIPs,
      blockedTotal: summary.totalBlocked,
    });
  }),
);

/**
 * GET /admin/rate-limits/blocked
 * List of manually blocked IPs.
 */
router.get(
  '/blocked',
  asyncHandler(async (_req, res) => {
    const ips = await rateLimiterService.getBlockedIps();
    res.json({ blocked: ips });
  }),
);

/**
 * POST /admin/rate-limits/blocked/:ip
 * Block an IP manually.
 */
router.post(
  '/blocked/:ip',
  asyncHandler(async (req, res) => {
    const ip = req.params.ip;
    await rateLimiterService.blockIp(ip);
    res.json({ blocked: true, ip });
  }),
);

/**
 * DELETE /admin/rate-limits/blocked/:ip
 * Unblock an IP.
 */
router.delete(
  '/blocked/:ip',
  asyncHandler(async (req, res) => {
    const ip = req.params.ip;
    await rateLimiterService.unblockIp(ip);
    res.json({ blocked: false, ip });
  }),
);

export default router;
