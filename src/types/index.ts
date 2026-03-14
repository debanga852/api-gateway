import { Request } from 'express';

// ─── HTTP ────────────────────────────────────────────────────────────────────

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD';

// ─── Route / Config ──────────────────────────────────────────────────────────

export interface RouteDefinition {
  id: string;
  path: string;          // Gateway path prefix e.g. /api/users
  target: string;        // Downstream URL  e.g. http://user-service:3001
  serviceId: string;     // Logical service name
  methods: HttpMethod[];
  stripPrefix: boolean;  // Strip the gateway prefix before forwarding
  auth: boolean;         // Require valid JWT
  rateLimit: boolean;    // Apply rate limiting
  timeout: number;       // ms
  retries: number;
  enabled: boolean;
}

export interface ServiceConfig {
  serviceId: string;
  url: string;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface JwtPayload {
  sub: string;         // userId
  email?: string;
  role: 'user' | 'admin' | 'service';
  apiKey?: string;
  jti: string;         // Token ID for blacklisting
  iat: number;
  exp: number;
}

export interface AdminJwtPayload {
  sub: string;
  role: 'admin';
  jti: string;
  iat: number;
  exp: number;
}

export interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
  requestId: string;
  startTime: number;
}

// ─── Rate Limiting ────────────────────────────────────────────────────────────

export type RateLimitWindowType = 'ip' | 'user' | 'apiKey';

export interface RateLimitTier {
  windowMs: number;
  maxRequests: number;
  ttlSeconds: number;
}

export interface RateLimitConfig {
  ip: RateLimitTier;
  user: RateLimitTier;
  apiKey: RateLimitTier;
}

export interface RateLimitContext {
  ip: string;
  userId?: string;
  apiKey?: string;
}

export interface RateLimitResult {
  allowed: boolean;
  windowType: RateLimitWindowType;
  limit: number;
  current: number;
  remaining: number;
  retryAfterSeconds: number;
  resetAtMs: number;
}

// ─── Circuit Breaker ─────────────────────────────────────────────────────────

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerOptions {
  serviceId: string;
  failureThreshold: number;   // trips to OPEN after N failures
  successThreshold: number;   // closes from HALF_OPEN after N successes
  timeout: number;            // ms before OPEN -> HALF_OPEN
  volumeThreshold: number;    // min requests before tripping
}

export interface CircuitSnapshot {
  serviceId: string;
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureAt: number | null;
  lastStateChange: number;
  openedAt: number | null;
  nextAttemptAt: number | null;
}

// ─── Metrics ─────────────────────────────────────────────────────────────────

export interface RequestMetric {
  requestId: string;
  serviceId: string;
  method: string;
  path: string;
  statusCode: number;
  latencyMs: number;
  bytesIn: number;
  bytesOut: number;
  timestamp: number;
  userId?: string;
  ip: string;
  rateLimited: boolean;
  circuitOpen: boolean;
}

export interface ServiceHealthMetric {
  serviceId: string;
  state: CircuitState;
  uptime: number;       // 0–1
  errorRate: number;    // 0–1
  avgLatencyMs: number;
  requestCount: number;
  lastCheckedAt: number;
}

export interface TimeBucket {
  timestamp: string;
  total: number;
  success: number;
  error: number;
  avgLatencyMs: number;
}

export interface AggregatedMetrics {
  buckets: TimeBucket[];
  totalRequests: number;
  totalErrors: number;
  avgLatencyMs: number;
}

export interface GlobalSummary {
  totalRequests: number;
  totalErrors: number;
  totalBlocked: number;
  errorRate: number;
  uptimeMs: number;
}

// ─── Admin / Dashboard ───────────────────────────────────────────────────────

export interface AdminLoginRequest {
  username: string;
  password: string;
}

export interface AdminLoginResponse {
  token: string;
  expiresAt: number;
}

export interface DashboardSummary {
  global: GlobalSummary;
  services: ServiceHealthMetric[];
  circuitBreakers: CircuitSnapshot[];
}
