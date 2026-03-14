import { RouteDefinition } from '../types';
import { config } from './index';

/**
 * Static route table loaded at startup.
 * In production these would live in Redis and support hot-reload.
 * The admin API at /admin/routes allows CRUD updates at runtime.
 */
export const defaultRoutes: RouteDefinition[] = [
  {
    id: 'users-service',
    path: '/api/users',
    target: config.services.a,
    serviceId: 'user-service',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    stripPrefix: false,
    auth: false,
    rateLimit: true,
    timeout: 5_000,
    retries: 1,
    enabled: true,
  },
  {
    id: 'products-service',
    path: '/api/products',
    target: config.services.b,
    serviceId: 'product-service',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    stripPrefix: false,
    auth: false,
    rateLimit: true,
    timeout: 5_000,
    retries: 1,
    enabled: true,
  },
  {
    id: 'orders-service',
    path: '/api/orders',
    target: config.services.b,   // maps to service-b for the demo
    serviceId: 'order-service',
    methods: ['GET', 'POST'],
    stripPrefix: false,
    auth: true,
    rateLimit: true,
    timeout: 8_000,
    retries: 2,
    enabled: true,
  },
];
