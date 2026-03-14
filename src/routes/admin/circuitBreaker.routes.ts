import { Router } from 'express';
import circuitBreakerService from '../../services/circuitBreaker.service';
import { asyncHandler } from '../../utils/asyncHandler';

const router = Router();

/**
 * GET /admin/circuit-breakers
 * All circuit breaker snapshots.
 */
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const snapshots = await circuitBreakerService.getAllSnapshots();
    res.json(snapshots);
  }),
);

/**
 * GET /admin/circuit-breakers/:serviceId
 */
router.get(
  '/:serviceId',
  asyncHandler(async (req, res) => {
    const snapshot = await circuitBreakerService.getSnapshot(req.params.serviceId);
    res.json(snapshot);
  }),
);

/**
 * POST /admin/circuit-breakers/:serviceId/trip
 * Force circuit to OPEN (for testing / emergency).
 */
router.post(
  '/:serviceId/trip',
  asyncHandler(async (req, res) => {
    const snapshot = await circuitBreakerService.forceTrip(req.params.serviceId);
    res.json(snapshot);
  }),
);

/**
 * POST /admin/circuit-breakers/:serviceId/reset
 * Force circuit to CLOSED and reset counters.
 */
router.post(
  '/:serviceId/reset',
  asyncHandler(async (req, res) => {
    const snapshot = await circuitBreakerService.forceReset(req.params.serviceId);
    res.json(snapshot);
  }),
);

export default router;
