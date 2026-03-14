import { Request, Response, NextFunction } from 'express';
import { createProxyMiddleware, responseInterceptor } from 'http-proxy-middleware';
import circuitBreakerService from './circuitBreaker.service';
import metricsService from './metrics.service';
import { AuthenticatedRequest, RouteDefinition, RequestMetric } from '../types';
import logger from '../utils/logger';

class ProxyService {
  /**
   * Build and return a middleware that proxies a request to the downstream service.
   * Integrates circuit breaker and metrics recording.
   */
  createProxyHandler(route: RouteDefinition) {
    const proxy = createProxyMiddleware<Request, Response>({
      target:       route.target,
      changeOrigin: true,
      selfHandleResponse: true,

      on: {
        proxyReq: (proxyReq, req) => {
          const authReq = req as AuthenticatedRequest;
          proxyReq.setHeader('X-Request-ID',     authReq.requestId ?? '');
          proxyReq.setHeader('X-Forwarded-For',  req.ip ?? '');
          proxyReq.setHeader('X-Gateway-Service', route.serviceId);
          if (authReq.user?.sub) {
            proxyReq.setHeader('X-User-ID', authReq.user.sub);
          }
        },

        proxyRes: responseInterceptor(async (responseBuffer, proxyRes, req, res) => {
          const authReq    = req as AuthenticatedRequest;
          const latencyMs  = Date.now() - (authReq.startTime ?? Date.now());
          const statusCode = proxyRes.statusCode ?? 200;

          // Record circuit breaker outcome
          if (statusCode >= 500) {
            await circuitBreakerService.recordFailure(route.serviceId);
          } else {
            await circuitBreakerService.recordSuccess(route.serviceId);
          }

          // Record metrics
          const metric: RequestMetric = {
            requestId:    authReq.requestId  ?? '',
            serviceId:    route.serviceId,
            method:       req.method,
            path:         req.url,
            statusCode,
            latencyMs,
            bytesIn:      parseInt(req.headers['content-length'] ?? '0', 10),
            bytesOut:     responseBuffer.length,
            timestamp:    Date.now(),
            userId:       authReq.user?.sub,
            ip:           req.ip ?? '',
            rateLimited:  false,
            circuitOpen:  false,
          };

          await metricsService.record(metric);

          return responseBuffer;
        }),

        error: async (err, req, res) => {
          const authReq   = req as AuthenticatedRequest;
          const latencyMs = Date.now() - (authReq.startTime ?? Date.now());

          logger.error('[Proxy] Upstream error', {
            serviceId: route.serviceId,
            path:      req.url,
            err:       (err as Error).message,
          });

          await circuitBreakerService.recordFailure(route.serviceId);

          await metricsService.record({
            requestId:   authReq.requestId ?? '',
            serviceId:   route.serviceId,
            method:      req.method,
            path:        req.url,
            statusCode:  502,
            latencyMs,
            bytesIn:     0,
            bytesOut:    0,
            timestamp:   Date.now(),
            userId:      authReq.user?.sub,
            ip:          req.ip ?? '',
            rateLimited: false,
            circuitOpen: false,
          });

          const httpRes = res as Response;
          if (!httpRes.headersSent) {
            httpRes.status(502).json({
              error:   'Bad Gateway',
              message: 'Upstream service unavailable',
              service: route.serviceId,
            });
          }
        },
      },
    });

    // Return a middleware that first checks the circuit breaker
    return async (req: Request, res: Response, next: NextFunction) => {
      const authReq = req as AuthenticatedRequest;

      const canRequest = await circuitBreakerService.canRequest(route.serviceId);
      if (!canRequest) {
        const snapshot = await circuitBreakerService.getSnapshot(route.serviceId);

        await metricsService.record({
          requestId:   authReq.requestId ?? '',
          serviceId:   route.serviceId,
          method:      req.method,
          path:        req.url,
          statusCode:  503,
          latencyMs:   0,
          bytesIn:     0,
          bytesOut:    0,
          timestamp:   Date.now(),
          userId:      authReq.user?.sub,
          ip:          req.ip ?? '',
          rateLimited: false,
          circuitOpen: true,
        });

        const retryAfterSec = snapshot.nextAttemptAt
          ? Math.max(0, Math.ceil((snapshot.nextAttemptAt - Date.now()) / 1000))
          : 30;

        res.setHeader('Retry-After', String(retryAfterSec));
        res.setHeader('X-Circuit-Breaker-State', snapshot.state);

        return res.status(503).json({
          error:   'Service Unavailable',
          message: `Circuit breaker is OPEN for service '${route.serviceId}'`,
          retryAfterSeconds: retryAfterSec,
        });
      }

      // Proxy through
      return proxy(req, res, next);
    };
  }
}

export const proxyService = new ProxyService();
export default proxyService;
