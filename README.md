# API Gateway

A production-grade API Gateway built with Node.js and TypeScript, featuring sliding-window rate limiting, a three-state circuit breaker, JWT authentication, real-time metrics, and a React admin dashboard — all backed by Redis and orchestrated with Docker Compose.

---

## Architecture

```
                        ┌─────────────────────────────────────────────┐
                        │               Client / Browser               │
                        └────────────────────┬────────────────────────┘
                                             │ HTTP
                        ┌────────────────────▼────────────────────────┐
                        │             API Gateway  :3000               │
                        │                                              │
                        │  ┌──────────┐  ┌─────────────┐  ┌────────┐ │
                        │  │  Auth    │  │ Rate Limiter │  │ Logger │ │
                        │  │ (JWT)    │  │ (Sliding Win)│  │(Winston│ │
                        │  └──────────┘  └─────────────┘  └────────┘ │
                        │                                              │
                        │  ┌──────────────────────────────────────┐   │
                        │  │          Circuit Breaker              │   │
                        │  │   CLOSED ──► OPEN ──► HALF_OPEN      │   │
                        │  └───────────────────┬──────────────────┘   │
                        │                      │ Proxy                 │
                        └──────────────────────┼──────────────────────┘
                                               │
                   ┌───────────────────────────┼───────────────────────┐
                   │                           │                       │
       ┌───────────▼──────────┐   ┌───────────▼──────────┐           │
       │  Service A  :3001    │   │  Service B  :3002    │           │
       │  (Users API)         │   │  (Products & Orders) │           │
       └──────────────────────┘   └──────────────────────┘           │
                                                                       │
                        ┌──────────────────────────────────────────────┘
                        │
            ┌───────────▼──────────┐     ┌───────────────────────────┐
            │    Redis  :6379      │     │  Admin Dashboard  :5173   │
            │  - Rate limit state  │     │  - Metrics & health       │
            │  - Circuit breaker   │     │  - Circuit breaker ctrl   │
            │  - Metrics           │     │  - Rate limit / IP block  │
            └──────────────────────┘     └───────────────────────────┘
```

---

## Features

| Feature | Details |
|---|---|
| **Rate Limiting** | Sliding-window algorithm via Redis Lua scripts; three tiers: IP (60/min), JWT user (300/min), API key (600/min) |
| **Circuit Breaker** | Three-state (CLOSED → OPEN → HALF_OPEN); per-service, atomic Redis Lua transitions |
| **JWT Authentication** | Separate secrets for gateway and admin tokens; optional per-route enforcement |
| **Request Proxying** | `http-proxy-middleware`; injects `X-Request-ID`, `X-Forwarded-*`, and circuit breaker state headers |
| **Metrics** | Per-request capture with time-bucketed Redis aggregation; accessible via admin API |
| **Admin Dashboard** | React + Recharts SPA; real-time health, manual circuit breaker trip/reset, IP blocking |
| **Security Headers** | Helmet.js (XSS, CSP, HSTS); configurable CORS |
| **Structured Logging** | Winston with daily rotation; captures method, path, status, latency, userId, IP |
| **Fail-Open Strategy** | Rate limiter and circuit breaker allow traffic if Redis is unavailable |

---

## Tech Stack

### Gateway (Backend)
| Package | Purpose |
|---|---|
| Node.js 20 + TypeScript 5.4 | Runtime and type safety |
| Express 4.19 | HTTP framework |
| http-proxy-middleware 3.0 | Reverse proxy |
| ioredis 5.3 | Redis client with Lua script execution |
| jsonwebtoken 9.0 | JWT signing and verification |
| Helmet 7.1 | Security headers |
| Winston 3.13 | Structured logging with daily rotation |

### Dashboard (Frontend)
| Package | Purpose |
|---|---|
| React 18 + Vite 5 | SPA framework and dev server |
| React Router 6 | Client-side routing |
| TailwindCSS 3 | Utility-first styling |
| Recharts 2 | Time-series and bar charts |
| Axios 1.7 | HTTP client with auth headers |

### Infrastructure
| Component | Version |
|---|---|
| Redis | 7 (Alpine) |
| Docker + Docker Compose | — |

---

## Project Structure

```
api-gateway/
├── src/
│   ├── server.ts                     # Entry point, graceful shutdown
│   ├── app.ts                        # Express setup, middleware chain
│   ├── config/
│   │   ├── index.ts                  # Centralised env-var config
│   │   └── routes.config.ts          # Route → service mapping
│   ├── middleware/
│   │   ├── auth.middleware.ts         # JWT parsing & enforcement
│   │   ├── adminAuth.middleware.ts    # Admin token validation
│   │   ├── rateLimit.middleware.ts    # Sliding-window rate limiting
│   │   ├── logger.middleware.ts       # Request logging
│   │   ├── requestId.middleware.ts    # X-Request-ID injection
│   │   └── errorHandler.middleware.ts # Global error handler
│   ├── routes/
│   │   ├── gateway.routes.ts          # Proxy routes
│   │   └── admin/
│   │       ├── auth.routes.ts         # Login & token issuance
│   │       ├── metrics.routes.ts      # Metrics endpoints
│   │       ├── circuitBreaker.routes.ts
│   │       └── rateLimit.routes.ts
│   ├── services/
│   │   ├── proxy.service.ts           # HTTP proxy + metrics
│   │   ├── rateLimiter.service.ts     # Sliding-window logic
│   │   ├── circuitBreaker.service.ts  # 3-state machine
│   │   ├── metrics.service.ts         # Aggregation
│   │   ├── auth.service.ts            # JWT helpers
│   │   └── redis.service.ts           # Redis + Lua scripts
│   ├── lua/
│   │   ├── slidingWindow.lua          # Atomic rate limit script
│   │   └── circuitBreaker.lua         # Atomic CB state transitions
│   └── types/index.ts
├── dashboard/                         # React admin dashboard
│   └── src/
│       ├── pages/                     # Dashboard, CircuitBreakers, RateLimits, Login
│       ├── components/                # Layout, StatCard
│       └── api/client.ts             # Axios instance
├── mock-services/
│   └── index.ts                       # Service A (:3001) + Service B (:3002)
├── Dockerfile
├── Dockerfile.mock
├── docker-compose.yml
└── .env.example
```

---

## Running Locally with Docker

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (includes Docker Compose)

### 1. Clone and configure

```bash
git clone <repo-url>
cd api-gateway
cp .env.example .env
```

Open `.env` and set secure values for `JWT_SECRET` and `ADMIN_JWT_SECRET` (at least 32 characters each). The defaults work for local testing.

### 2. Start all services

```bash
docker-compose up --build
```

This starts:

| Service | URL | Description |
|---|---|---|
| API Gateway | http://localhost:3000 | Main proxy entry point |
| Admin Dashboard | http://localhost:5173 | React SPA (login: `admin` / `admin123`) |
| Mock Service A | http://localhost:3001 | Users API |
| Mock Service B | http://localhost:3002 | Products & Orders API |
| Redis | localhost:6379 | State store |

### 3. Stop

```bash
docker-compose down
```

Add `-v` to also remove Redis data volumes.

---

### Local Development (without Docker)

```bash
# Terminal 1 — Redis
redis-server

# Terminal 2 — Gateway
npm install && npm run dev

# Terminal 3 — Mock services
cd mock-services && npm install && npx ts-node index.ts

# Terminal 4 — Dashboard
cd dashboard && npm install && npm run dev
```

---

## Environment Variables

Copy `.env.example` to `.env` and adjust as needed.

```bash
# Server
NODE_ENV=development
PORT=3000

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# Gateway JWT
JWT_SECRET=change-me-to-a-long-random-secret-at-least-32-chars
JWT_EXPIRES_IN=1h

# Admin JWT (separate secret)
ADMIN_JWT_SECRET=change-me-admin-secret-also-at-least-32-chars
ADMIN_JWT_EXPIRES_IN=8h
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123

# Rate Limiting
RL_IP_WINDOW_MS=60000
RL_IP_MAX_REQUESTS=60
RL_USER_WINDOW_MS=60000
RL_USER_MAX_REQUESTS=300
RL_APIKEY_WINDOW_MS=60000
RL_APIKEY_MAX_REQUESTS=600

# Circuit Breaker
CB_FAILURE_THRESHOLD=5
CB_SUCCESS_THRESHOLD=2
CB_TIMEOUT_MS=30000
CB_VOLUME_THRESHOLD=10

# Downstream Services
SERVICE_A_URL=http://localhost:3001
SERVICE_B_URL=http://localhost:3002

# Logging
LOG_LEVEL=info
LOG_DIR=./logs

# CORS
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
```

---

## API Endpoints

### Public Gateway Routes

| Method | Path | Auth Required | Description |
|---|---|---|---|
| `GET` | `/health` | No | Gateway health check |
| `GET` | `/api/users` | No | List all users |
| `POST` | `/api/users` | No | Create a user |
| `GET` | `/api/users/:id` | No | Get user by ID |
| `PUT` | `/api/users/:id` | No | Update a user |
| `DELETE` | `/api/users/:id` | No | Delete a user |
| `GET` | `/api/products` | No | List all products |
| `POST` | `/api/products` | No | Create a product |
| `GET` | `/api/products/:id` | No | Get product by ID |
| `PUT` | `/api/products/:id` | No | Update a product |
| `DELETE` | `/api/products/:id` | No | Delete a product |
| `GET` | `/api/orders` | **Yes (JWT)** | List orders |
| `POST` | `/api/orders` | **Yes (JWT)** | Create an order |
| `GET` | `/api/orders/:id` | **Yes (JWT)** | Get order by ID |

All routes are rate-limited. Unauthenticated requests are limited by IP (60 req/min). Authenticated requests use per-user (300/min) or per-API-key (600/min) limits.

Response headers on every proxied request:
```
X-Request-ID: <uuid>
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 59
X-RateLimit-Reset: 1710000060
X-Circuit-Breaker-State: CLOSED
```

### Admin API

All admin endpoints require an admin JWT in the `Authorization: Bearer <token>` header.

#### Authentication

| Method | Path | Description |
|---|---|---|
| `POST` | `/admin/auth/login` | Issue admin JWT (`{ username, password }`) |
| `POST` | `/admin/auth/token` | Issue gateway JWT for testing (`{ userId, role }`) |

#### Health & Metrics

| Method | Path | Description |
|---|---|---|
| `GET` | `/admin/health` | Full system health + Redis status |
| `GET` | `/admin/metrics` | Aggregated metrics for all services |
| `GET` | `/admin/metrics/:serviceId` | Metrics for a specific service |

#### Circuit Breaker Management

| Method | Path | Description |
|---|---|---|
| `GET` | `/admin/circuit-breakers` | View all circuit breaker states |
| `POST` | `/admin/circuit-breakers/:serviceId/trip` | Force-trip a circuit |
| `POST` | `/admin/circuit-breakers/:serviceId/reset` | Force-reset a circuit |

Service IDs: `user-service`, `product-service`, `order-service`

#### Rate Limit Management

| Method | Path | Description |
|---|---|---|
| `GET` | `/admin/rate-limits` | Current rate limit configuration |
| `GET` | `/admin/rate-limits/blocked` | List of blocked IPs |
| `POST` | `/admin/rate-limits/block-ip` | Manually block an IP |
| `DELETE` | `/admin/rate-limits/unblock-ip` | Unblock an IP |

---

## Quick Start Examples

```bash
# Health check
curl http://localhost:3000/health

# List users (rate limited by IP)
curl http://localhost:3000/api/users

# Get admin JWT
TOKEN=$(curl -s -X POST http://localhost:3000/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | jq -r '.token')

# Issue a gateway JWT for testing protected routes
GW_TOKEN=$(curl -s -X POST http://localhost:3000/admin/auth/token \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"userId":"user123","role":"user"}' | jq -r '.token')

# Access an authenticated route
curl -H "Authorization: Bearer $GW_TOKEN" http://localhost:3000/api/orders

# View circuit breaker states
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/admin/circuit-breakers

# Simulate downstream failures to trigger the circuit breaker
curl -X POST http://localhost:3001/admin/fail-mode

# Force-reset a tripped circuit
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/admin/circuit-breakers/user-service/reset
```

---

## Circuit Breaker Behaviour

```
      ┌──────────────────────────────────────┐
      │                                      │
      ▼                                      │
  [CLOSED]  ──(≥5 failures)──►  [OPEN]      │
      ▲                           │          │
      │                      (30s timeout)   │
      │                           ▼          │
      └──(≥2 successes)──  [HALF_OPEN]       │
                                 │           │
                          (failure)──────────┘
```

| State | Behaviour |
|---|---|
| **CLOSED** | Normal operation. All requests pass through. |
| **OPEN** | Service considered down. Requests rejected immediately with `503`. |
| **HALF_OPEN** | One probe request allowed. Success → CLOSED; failure → OPEN. |

Thresholds are configurable via environment variables (`CB_FAILURE_THRESHOLD`, `CB_SUCCESS_THRESHOLD`, `CB_TIMEOUT_MS`, `CB_VOLUME_THRESHOLD`).

---

## Admin Dashboard

Navigate to http://localhost:5173 and log in with `admin` / `admin123`.

| Page | Features |
|---|---|
| **Dashboard** | Live request counts, error rates, avg latency, service health cards, time-series charts |
| **Circuit Breakers** | Per-service state badges, manual Trip / Reset controls |
| **Rate Limits** | Configured limits per tier, blocked IP list, block / unblock controls |

---

## License

MIT
