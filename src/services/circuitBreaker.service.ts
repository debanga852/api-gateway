import redisService from './redis.service';
import { config } from '../config';
import { RedisKeys } from '../utils/redisKeys';
import {
  CircuitBreakerOptions,
  CircuitSnapshot,
  CircuitState,
  RouteDefinition,
} from '../types';
import logger from '../utils/logger';

class CircuitBreakerService {
  private options = new Map<string, CircuitBreakerOptions>();

  /** Register a service with circuit breaker options. Called at startup. */
  register(opts: CircuitBreakerOptions): void {
    this.options.set(opts.serviceId, opts);
    logger.debug('[CircuitBreaker] Registered service', { serviceId: opts.serviceId });
  }

  registerRoutes(routes: RouteDefinition[]): void {
    const seen = new Set<string>();
    for (const route of routes) {
      if (!seen.has(route.serviceId)) {
        seen.add(route.serviceId);
        this.register({
          serviceId:        route.serviceId,
          failureThreshold: config.circuitBreaker.failureThreshold,
          successThreshold: config.circuitBreaker.successThreshold,
          timeout:          config.circuitBreaker.timeout,
          volumeThreshold:  config.circuitBreaker.volumeThreshold,
        });
      }
    }
  }

  private getOpts(serviceId: string): CircuitBreakerOptions {
    return (
      this.options.get(serviceId) ?? {
        serviceId,
        failureThreshold: config.circuitBreaker.failureThreshold,
        successThreshold: config.circuitBreaker.successThreshold,
        timeout:          config.circuitBreaker.timeout,
        volumeThreshold:  config.circuitBreaker.volumeThreshold,
      }
    );
  }

  /**
   * Check if a request to serviceId is allowed.
   * Handles lazy OPEN -> HALF_OPEN transition based on timeout.
   */
  async canRequest(serviceId: string): Promise<boolean> {
    const snapshot = await this.getSnapshot(serviceId);

    if (snapshot.state === CircuitState.CLOSED)    return true;
    if (snapshot.state === CircuitState.HALF_OPEN) return true; // one probe allowed

    // OPEN — check if timeout has elapsed
    const now = Date.now();
    if (snapshot.openedAt && now - snapshot.openedAt >= this.getOpts(serviceId).timeout) {
      return true; // Lua will handle actual transition on next record call
    }

    return false;
  }

  async recordSuccess(serviceId: string): Promise<CircuitState> {
    return this.transition(serviceId, 'SUCCESS');
  }

  async recordFailure(serviceId: string): Promise<CircuitState> {
    return this.transition(serviceId, 'FAILURE');
  }

  private async transition(serviceId: string, event: 'SUCCESS' | 'FAILURE'): Promise<CircuitState> {
    const opts  = this.getOpts(serviceId);
    const redis = redisService.getClient();
    const sha   = redisService.circuitBreakerSha;

    try {
      const newState = await redis.evalsha(
        sha,
        1,
        RedisKeys.circuitBreaker.state(serviceId),
        event,
        String(Date.now()),
        String(opts.failureThreshold),
        String(opts.successThreshold),
        String(opts.timeout),
      ) as string;

      const state = newState as CircuitState;

      if (event === 'FAILURE' && state === CircuitState.OPEN) {
        logger.warn('[CircuitBreaker] Circuit OPENED', { serviceId });
      }
      if (event === 'SUCCESS' && state === CircuitState.CLOSED) {
        logger.info('[CircuitBreaker] Circuit CLOSED (recovered)', { serviceId });
      }

      return state;
    } catch (err) {
      logger.error('[CircuitBreaker] Transition error', { serviceId, err });
      return CircuitState.CLOSED; // fail open
    }
  }

  async getSnapshot(serviceId: string): Promise<CircuitSnapshot> {
    const redis = redisService.getClient();
    const key   = RedisKeys.circuitBreaker.state(serviceId);
    const data  = await redis.hgetall(key);

    if (!data || !data.state) {
      return {
        serviceId,
        state:           CircuitState.CLOSED,
        failureCount:    0,
        successCount:    0,
        lastFailureAt:   null,
        lastStateChange: Date.now(),
        openedAt:        null,
        nextAttemptAt:   null,
      };
    }

    return {
      serviceId,
      state:           data.state as CircuitState,
      failureCount:    parseInt(data.failureCount ?? '0', 10),
      successCount:    parseInt(data.successCount ?? '0', 10),
      lastFailureAt:   data.lastFailureAt ? parseInt(data.lastFailureAt, 10) : null,
      lastStateChange: parseInt(data.lastStateChange ?? '0', 10),
      openedAt:        data.openedAt ? parseInt(data.openedAt, 10) : null,
      nextAttemptAt:   data.nextAttemptAt ? parseInt(data.nextAttemptAt, 10) : null,
    };
  }

  async getAllSnapshots(): Promise<CircuitSnapshot[]> {
    const serviceIds = Array.from(this.options.keys());
    return Promise.all(serviceIds.map((id) => this.getSnapshot(id)));
  }

  /** Admin: force circuit to OPEN immediately. */
  async forceTrip(serviceId: string): Promise<CircuitSnapshot> {
    const redis = redisService.getClient();
    const now   = Date.now();
    const opts  = this.getOpts(serviceId);

    await redis.hmset(RedisKeys.circuitBreaker.state(serviceId), {
      state:           CircuitState.OPEN,
      failureCount:    String(opts.failureThreshold),
      successCount:    '0',
      lastFailureAt:   String(now),
      openedAt:        String(now),
      nextAttemptAt:   String(now + opts.timeout),
      lastStateChange: String(now),
    });

    logger.warn('[CircuitBreaker] Force-tripped', { serviceId });
    return this.getSnapshot(serviceId);
  }

  /** Admin: force circuit to CLOSED and reset counters. */
  async forceReset(serviceId: string): Promise<CircuitSnapshot> {
    const redis = redisService.getClient();
    const now   = Date.now();

    await redis.hmset(RedisKeys.circuitBreaker.state(serviceId), {
      state:           CircuitState.CLOSED,
      failureCount:    '0',
      successCount:    '0',
      lastFailureAt:   '',
      openedAt:        '',
      nextAttemptAt:   '',
      lastStateChange: String(now),
    });

    logger.info('[CircuitBreaker] Force-reset', { serviceId });
    return this.getSnapshot(serviceId);
  }
}

export const circuitBreakerService = new CircuitBreakerService();
export default circuitBreakerService;
