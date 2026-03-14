import dotenv from 'dotenv';
dotenv.config();

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required environment variable: ${key}`);
  return val;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

function optionalInt(key: string, fallback: number): number {
  const val = process.env[key];
  return val ? parseInt(val, 10) : fallback;
}

export const config = {
  env: optional('NODE_ENV', 'development'),
  port: optionalInt('PORT', 3000),

  redis: {
    host:     optional('REDIS_HOST', 'localhost'),
    port:     optionalInt('REDIS_PORT', 6379),
    password: optional('REDIS_PASSWORD', '') || undefined,
    db:       optionalInt('REDIS_DB', 0),
  },

  jwt: {
    secret:    required('JWT_SECRET'),
    expiresIn: optional('JWT_EXPIRES_IN', '1h'),
    algorithm: optional('JWT_ALGORITHM', 'HS256') as 'HS256',
  },

  adminJwt: {
    secret:    required('ADMIN_JWT_SECRET'),
    expiresIn: optional('ADMIN_JWT_EXPIRES_IN', '8h'),
  },

  admin: {
    username: optional('ADMIN_USERNAME', 'admin'),
    password: optional('ADMIN_PASSWORD', 'admin123'),
  },

  rateLimit: {
    ip: {
      windowMs:    optionalInt('RL_IP_WINDOW_MS', 60_000),
      maxRequests: optionalInt('RL_IP_MAX_REQUESTS', 60),
      get ttlSeconds() { return Math.ceil(config.rateLimit.ip.windowMs / 1000) + 10; },
    },
    user: {
      windowMs:    optionalInt('RL_USER_WINDOW_MS', 60_000),
      maxRequests: optionalInt('RL_USER_MAX_REQUESTS', 300),
      get ttlSeconds() { return Math.ceil(config.rateLimit.user.windowMs / 1000) + 10; },
    },
    apiKey: {
      windowMs:    optionalInt('RL_APIKEY_WINDOW_MS', 60_000),
      maxRequests: optionalInt('RL_APIKEY_MAX_REQUESTS', 600),
      get ttlSeconds() { return Math.ceil(config.rateLimit.apiKey.windowMs / 1000) + 10; },
    },
  },

  circuitBreaker: {
    failureThreshold: optionalInt('CB_FAILURE_THRESHOLD', 5),
    successThreshold: optionalInt('CB_SUCCESS_THRESHOLD', 2),
    timeout:          optionalInt('CB_TIMEOUT_MS', 30_000),
    volumeThreshold:  optionalInt('CB_VOLUME_THRESHOLD', 10),
  },

  services: {
    a: optional('SERVICE_A_URL', 'http://localhost:3001'),
    b: optional('SERVICE_B_URL', 'http://localhost:3002'),
  },

  cors: {
    origins: optional('CORS_ORIGINS', 'http://localhost:5173,http://localhost:3000')
      .split(',')
      .map((o) => o.trim()),
  },

  log: {
    level: optional('LOG_LEVEL', 'info'),
    dir:   optional('LOG_DIR', './logs'),
  },
} as const;
