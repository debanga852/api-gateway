/**
 * Centralized Redis key factory.
 * All keys in one place prevents naming drift across services.
 */
export const RedisKeys = {
  rateLimit: {
    ip:      (ip: string)      => `rl:ip:${ip}`,
    user:    (userId: string)  => `rl:user:${userId}`,
    apiKey:  (key: string)     => `rl:apikey:${key}`,
    blocked: (ip: string)      => `rl:blocked:${ip}`,
  },

  circuitBreaker: {
    state:  (serviceId: string) => `cb:${serviceId}`,
    config: (serviceId: string) => `cb:config:${serviceId}`,
  },

  metrics: {
    // Minute-bucket key: metrics:requests:user-service:2024-01-15-14-30
    bucket:  (serviceId: string, bucket: string) => `metrics:requests:${serviceId}:${bucket}`,
    health:  (serviceId: string)                 => `metrics:health:${serviceId}`,
    global:  (counter: string)                   => `metrics:global:${counter}`,
    daily:   (date: string)                      => `metrics:global:date:${date}`,
    rlHit:   (type: string, id: string)          => `metrics:ratelimit:${type}:${id}`,
    rlTotal: ()                                  => 'metrics:ratelimit:blocked:total',
    topIPs:  ()                                  => 'metrics:ratelimit:top_ips',
  },

  auth: {
    blacklist: (jti: string)    => `auth:blacklist:${jti}`,
    refresh:   (userId: string) => `auth:refresh:${userId}`,
  },
} as const;

/**
 * Generate a minute-resolution bucket string from a timestamp.
 * Format: YYYY-MM-DD-HH-mm
 */
export function timeBucketKey(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return [
    d.getUTCFullYear(),
    pad(d.getUTCMonth() + 1),
    pad(d.getUTCDate()),
    pad(d.getUTCHours()),
    pad(d.getUTCMinutes()),
  ].join('-');
}

/**
 * Generate a date string YYYY-MM-DD for daily rollups.
 */
export function dailyKey(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
