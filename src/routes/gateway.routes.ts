import { Router, Request, Response } from 'express';
import { defaultRoutes } from '../config/routes.config';
import { rateLimitMiddleware } from '../middleware/rateLimit.middleware';
import { jwtMiddleware, requireAuth } from '../middleware/auth.middleware';
import proxyService from '../services/proxy.service';
import metricsService from '../services/metrics.service';
import circuitBreakerService from '../services/circuitBreaker.service';
import logger from '../utils/logger';

export function createGatewayRouter(): Router {
  const router = Router();

  for (const route of defaultRoutes) {
    if (!route.enabled) {
      logger.info(`[Gateway] Route disabled, skipping: ${route.path}`, { id: route.id });
      continue;
    }

    // Register service for metrics and circuit breaker tracking
    metricsService.registerService(route.serviceId);
    circuitBreakerService.registerRoutes([route]);

    const middlewareChain: Array<(req: Request, res: Response, next: any) => void> = [];

    // JWT parsing (always — populates req.user if token present)
    middlewareChain.push(jwtMiddleware);

    // Rate limiting (if configured for this route)
    if (route.rateLimit) {
      middlewareChain.push(rateLimitMiddleware);
    }

    // Auth enforcement (if route requires auth)
    if (route.auth) {
      middlewareChain.push(requireAuth);
    }

    // Proxy handler (last — circuit breaker + actual forwarding)
    const proxyHandler = proxyService.createProxyHandler(route);
    middlewareChain.push(proxyHandler);

    // Mount for each allowed method
    for (const method of route.methods) {
      const routePath = `${route.path}*`;
      const m = method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete';

      router[m](routePath, ...middlewareChain);

      logger.info(`[Gateway] Mounted ${method} ${routePath} → ${route.target}`, {
        serviceId:  route.serviceId,
        auth:       route.auth,
        rateLimit:  route.rateLimit,
      });
    }
  }

  return router;
}
