import apiClient from './client';

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const login = (username: string, password: string) =>
  apiClient.post<{ token: string; expiresAt: number }>('/auth/login', { username, password });

// ─── Health ───────────────────────────────────────────────────────────────────

export const getHealth = () =>
  apiClient.get('/health');

// ─── Global Summary ───────────────────────────────────────────────────────────

export const getGlobalSummary = () =>
  apiClient.get('/metrics/summary');

// ─── Services ─────────────────────────────────────────────────────────────────

export const getServiceHealth = () =>
  apiClient.get('/metrics/services');

export const getServiceTimeSeries = (
  serviceId: string,
  from?: string,
  to?: string,
) => {
  const params: Record<string, string> = { serviceId };
  if (from) params.from = from;
  if (to)   params.to   = to;
  return apiClient.get('/metrics/timeseries', { params });
};

// ─── Circuit Breakers ─────────────────────────────────────────────────────────

export const getCircuitBreakers = () =>
  apiClient.get('/circuit-breakers');

export const tripCircuit = (serviceId: string) =>
  apiClient.post(`/circuit-breakers/${serviceId}/trip`);

export const resetCircuit = (serviceId: string) =>
  apiClient.post(`/circuit-breakers/${serviceId}/reset`);

// ─── Rate Limits ──────────────────────────────────────────────────────────────

export const getRateLimitConfig = () =>
  apiClient.get('/rate-limits/config');

export const getRateLimitStats = () =>
  apiClient.get('/rate-limits/stats');

export const getBlockedIPs = () =>
  apiClient.get('/rate-limits/blocked');

export const blockIP = (ip: string) =>
  apiClient.post(`/rate-limits/blocked/${ip}`);

export const unblockIP = (ip: string) =>
  apiClient.delete(`/rate-limits/blocked/${ip}`);
