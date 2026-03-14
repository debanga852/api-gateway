import { v4 as uuidv4 } from 'uuid';
import redisService from './redis.service';
import { config } from '../config';
import { RedisKeys } from '../utils/redisKeys';
import { RateLimitContext, RateLimitResult, RateLimitTier, RateLimitWindowType } from '../types';
import logger from '../utils/logger';

class RateLimiterService {
  /**
   * Check rate limits in priority order: apiKey → user → ip.
   * Returns the first rejection, or the most restrictive allowed result.
   */
  async check(context: RateLimitContext): Promise<RateLimitResult> {
    const { ip, userId, apiKey } = context;

    // API key takes highest priority / most generous tier
    if (apiKey) {
      const result = await this.checkSingle(
        RedisKeys.rateLimit.apiKey(apiKey),
        config.rateLimit.apiKey,
        'apiKey',
      );
      if (!result.allowed) return result;
    }

    // Authenticated user
    if (userId) {
      const result = await this.checkSingle(
        RedisKeys.rateLimit.user(userId),
        config.rateLimit.user,
        'user',
      );
      if (!result.allowed) return result;
    }

    // Always check IP
    return this.checkSingle(
      RedisKeys.rateLimit.ip(ip),
      config.rateLimit.ip,
      'ip',
    );
  }

  private async checkSingle(
    key: string,
    tier: RateLimitTier,
    windowType: RateLimitWindowType,
  ): Promise<RateLimitResult> {
    const now        = Date.now();
    const requestId  = uuidv4();
    const redis      = redisService.getClient();
    const sha        = redisService.slidingWindowSha;

    try {
      const result = await redis.evalsha(
        sha,
        1,
        key,
        String(now),
        String(tier.windowMs),
        String(tier.maxRequests),
        requestId,
        String(tier.ttlSeconds),
      ) as [number, number, number];

      const [allowed, current, retryAfter] = result;

      return {
        allowed:            allowed === 1,
        windowType,
        limit:              tier.maxRequests,
        current,
        remaining:          Math.max(0, tier.maxRequests - current),
        retryAfterSeconds:  retryAfter,
        resetAtMs:          now + tier.windowMs,
      };
    } catch (err) {
      logger.error('[RateLimiter] EVALSHA failed', { key, err });
      // Fail open — let the request through if Redis is unavailable
      return {
        allowed:           true,
        windowType,
        limit:             tier.maxRequests,
        current:           0,
        remaining:         tier.maxRequests,
        retryAfterSeconds: 0,
        resetAtMs:         now + tier.windowMs,
      };
    }
  }

  /** Manually block an IP by setting a permanent marker. */
  async blockIp(ip: string): Promise<void> {
    const redis = redisService.getClient();
    await redis.set(RedisKeys.rateLimit.blocked(ip), '1');
  }

  async unblockIp(ip: string): Promise<void> {
    const redis = redisService.getClient();
    await redis.del(RedisKeys.rateLimit.blocked(ip));
  }

  async isBlocked(ip: string): Promise<boolean> {
    const redis  = redisService.getClient();
    const result = await redis.get(RedisKeys.rateLimit.blocked(ip));
    return result === '1';
  }

  async getBlockedIps(): Promise<string[]> {
    const redis = redisService.getClient();
    const keys  = await redis.keys('rl:blocked:*');
    return keys.map((k) => k.replace('rl:blocked:', ''));
  }

  async getRateLimitConfig() {
    return {
      ip:     config.rateLimit.ip,
      user:   config.rateLimit.user,
      apiKey: config.rateLimit.apiKey,
    };
  }
}

export const rateLimiterService = new RateLimiterService();
export default rateLimiterService;
