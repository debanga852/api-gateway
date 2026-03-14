import redisService from './redis.service';
import circuitBreakerService from './circuitBreaker.service';
import { RedisKeys, timeBucketKey, dailyKey } from '../utils/redisKeys';
import {
  RequestMetric,
  ServiceHealthMetric,
  TimeBucket,
  AggregatedMetrics,
  GlobalSummary,
  CircuitState,
} from '../types';
import logger from '../utils/logger';

const BUCKET_TTL_SECONDS = 48 * 60 * 60;  // 48 hours
const HEALTH_TTL_SECONDS = 120;            // 2 minutes
const DAILY_TTL_SECONDS  = 30 * 24 * 3600; // 30 days

class MetricsService {
  private startTime = Date.now();
  private registeredServices = new Set<string>();

  registerService(serviceId: string): void {
    this.registeredServices.add(serviceId);
  }

  async record(metric: RequestMetric): Promise<void> {
    const redis  = redisService.getClient();
    const bucket = timeBucketKey(metric.timestamp);
    const daily  = dailyKey(metric.timestamp);
    const isErr  = metric.statusCode >= 500 || metric.circuitOpen;

    try {
      const pipe = redis.pipeline();

      // ── Minute bucket (time series) ──────────────────────────────
      const bucketKey = RedisKeys.metrics.bucket(metric.serviceId, bucket);
      pipe.hincrby(bucketKey, 'total',   1);
      pipe.hincrby(bucketKey, isErr ? 'error' : 'success', 1);
      pipe.hincrby(bucketKey, 'latency', metric.latencyMs);  // sum for avg calc
      pipe.expire(bucketKey, BUCKET_TTL_SECONDS);

      // ── Service health snapshot ───────────────────────────────────
      const healthKey = RedisKeys.metrics.health(metric.serviceId);
      pipe.hincrby(healthKey, 'total',   1);
      pipe.hincrby(healthKey, isErr ? 'errors' : 'success', 1);
      pipe.hincrby(healthKey, 'latency', metric.latencyMs);
      pipe.hset(healthKey,    'lastCheckedAt', String(metric.timestamp));
      pipe.expire(healthKey, HEALTH_TTL_SECONDS);

      // ── Global counters ───────────────────────────────────────────
      pipe.incr(RedisKeys.metrics.global('total'));
      if (isErr)               pipe.incr(RedisKeys.metrics.global('errors'));
      if (metric.rateLimited)  pipe.incr(RedisKeys.metrics.global('blocked'));

      // ── Daily rollup ──────────────────────────────────────────────
      const dailyKey2 = RedisKeys.metrics.daily(daily);
      pipe.hincrby(dailyKey2, 'total',   1);
      if (isErr) pipe.hincrby(dailyKey2, 'errors', 1);
      if (metric.rateLimited) pipe.hincrby(dailyKey2, 'blocked', 1);
      pipe.expire(dailyKey2, DAILY_TTL_SECONDS);

      // ── Rate limit hits per IP ────────────────────────────────────
      if (metric.rateLimited) {
        pipe.incr(RedisKeys.metrics.rlHit('ip', metric.ip));
        pipe.expire(RedisKeys.metrics.rlHit('ip', metric.ip), 3600);
        pipe.incr(RedisKeys.metrics.rlTotal());
        // Track top blocked IPs in a sorted set
        pipe.zincrby(RedisKeys.metrics.topIPs(), 1, metric.ip);
        pipe.expire(RedisKeys.metrics.topIPs(), 86400);
      }

      await pipe.exec();
    } catch (err) {
      logger.error('[Metrics] Failed to record', { err });
    }
  }

  async getTimeSeries(
    serviceId: string,
    from: Date,
    to: Date,
  ): Promise<AggregatedMetrics> {
    const redis   = redisService.getClient();
    const buckets = this.generateBuckets(from, to);

    const pipe = redis.pipeline();
    for (const b of buckets) {
      pipe.hgetall(RedisKeys.metrics.bucket(serviceId, b));
    }

    const results = await pipe.exec();
    const timeBuckets: TimeBucket[] = [];
    let totalLatency = 0, totalReqs = 0, totalErrors = 0;

    for (let i = 0; i < buckets.length; i++) {
      const data = results?.[i]?.[1] as Record<string, string> | null;
      const total   = parseInt(data?.total   ?? '0', 10);
      const error   = parseInt(data?.error   ?? '0', 10);
      const success = parseInt(data?.success ?? '0', 10);
      const latency = parseInt(data?.latency ?? '0', 10);
      const avg     = total > 0 ? Math.round(latency / total) : 0;

      totalLatency += latency;
      totalReqs    += total;
      totalErrors  += error;

      timeBuckets.push({ timestamp: buckets[i], total, success, error, avgLatencyMs: avg });
    }

    return {
      buckets:        timeBuckets,
      totalRequests:  totalReqs,
      totalErrors,
      avgLatencyMs:   totalReqs > 0 ? Math.round(totalLatency / totalReqs) : 0,
    };
  }

  async getServiceHealth(serviceId: string): Promise<ServiceHealthMetric> {
    const redis = redisService.getClient();
    const data  = await redis.hgetall(RedisKeys.metrics.health(serviceId));
    const cb    = await circuitBreakerService.getSnapshot(serviceId);

    const total   = parseInt(data?.total   ?? '0', 10);
    const errors  = parseInt(data?.errors  ?? '0', 10);
    const latency = parseInt(data?.latency ?? '0', 10);

    return {
      serviceId,
      state:          cb.state,
      uptime:         total > 0 ? (total - errors) / total : 1,
      errorRate:      total > 0 ? errors / total : 0,
      avgLatencyMs:   total > 0 ? Math.round(latency / total) : 0,
      requestCount:   total,
      lastCheckedAt:  parseInt(data?.lastCheckedAt ?? '0', 10) || Date.now(),
    };
  }

  async getAllServiceHealth(): Promise<ServiceHealthMetric[]> {
    const ids = Array.from(this.registeredServices);
    return Promise.all(ids.map((id) => this.getServiceHealth(id)));
  }

  async getGlobalSummary(): Promise<GlobalSummary> {
    const redis = redisService.getClient();
    const [total, errors, blocked] = await Promise.all([
      redis.get(RedisKeys.metrics.global('total')),
      redis.get(RedisKeys.metrics.global('errors')),
      redis.get(RedisKeys.metrics.global('blocked')),
    ]);

    const t = parseInt(total  ?? '0', 10);
    const e = parseInt(errors ?? '0', 10);
    const b = parseInt(blocked ?? '0', 10);

    return {
      totalRequests: t,
      totalErrors:   e,
      totalBlocked:  b,
      errorRate:     t > 0 ? e / t : 0,
      uptimeMs:      Date.now() - this.startTime,
    };
  }

  async getTopBlockedIPs(limit = 10): Promise<Array<{ ip: string; count: number }>> {
    const redis  = redisService.getClient();
    const result = await redis.zrevrange(RedisKeys.metrics.topIPs(), 0, limit - 1, 'WITHSCORES');

    const list: Array<{ ip: string; count: number }> = [];
    for (let i = 0; i < result.length; i += 2) {
      list.push({ ip: result[i], count: parseInt(result[i + 1], 10) });
    }
    return list;
  }

  private generateBuckets(from: Date, to: Date): string[] {
    const buckets: string[] = [];
    const cur = new Date(from);
    cur.setUTCSeconds(0, 0);

    while (cur <= to) {
      buckets.push(timeBucketKey(cur.getTime()));
      cur.setUTCMinutes(cur.getUTCMinutes() + 1);
    }
    return buckets;
  }
}

export const metricsService = new MetricsService();
export default metricsService;
