import { Router } from 'express';
import metricsService from '../../services/metrics.service';
import { asyncHandler } from '../../utils/asyncHandler';

const router = Router();

/**
 * GET /admin/metrics/summary
 * Global request totals, error rate, uptime.
 */
router.get(
  '/summary',
  asyncHandler(async (_req, res) => {
    const summary = await metricsService.getGlobalSummary();
    res.json(summary);
  }),
);

/**
 * GET /admin/metrics/services
 * Health snapshot for all registered services.
 */
router.get(
  '/services',
  asyncHandler(async (_req, res) => {
    const health = await metricsService.getAllServiceHealth();
    res.json(health);
  }),
);

/**
 * GET /admin/metrics/services/:serviceId
 * Health + 60-minute time series for a single service.
 */
router.get(
  '/services/:serviceId',
  asyncHandler(async (req, res) => {
    const { serviceId } = req.params;
    const to            = new Date();
    const from          = new Date(to.getTime() - 60 * 60 * 1000); // last 1 hour

    const [health, timeseries] = await Promise.all([
      metricsService.getServiceHealth(serviceId),
      metricsService.getTimeSeries(serviceId, from, to),
    ]);

    res.json({ ...health, timeseries });
  }),
);

/**
 * GET /admin/metrics/timeseries?serviceId=&from=&to=
 * Time-series buckets for charts.
 * from/to are ISO date strings; defaults to last hour.
 */
router.get(
  '/timeseries',
  asyncHandler(async (req, res) => {
    const { serviceId, from: fromStr, to: toStr } = req.query as Record<string, string>;

    const to   = toStr   ? new Date(toStr)   : new Date();
    const from = fromStr ? new Date(fromStr)  : new Date(to.getTime() - 60 * 60 * 1000);

    if (!serviceId) {
      res.status(400).json({ error: 'BadRequest', message: 'serviceId query param required' });
      return;
    }

    const data = await metricsService.getTimeSeries(serviceId, from, to);
    res.json(data);
  }),
);

/**
 * GET /admin/metrics/rate-limits
 * Top blocked IPs and aggregate blocked request count.
 */
router.get(
  '/rate-limits',
  asyncHandler(async (_req, res) => {
    const [topBlockedIPs, summary] = await Promise.all([
      metricsService.getTopBlockedIPs(20),
      metricsService.getGlobalSummary(),
    ]);

    res.json({ topBlockedIPs, blockedTotal: summary.totalBlocked });
  }),
);

export default router;
