import Redis from 'ioredis';
import fs from 'fs';
import path from 'path';
import { config } from '../config';
import logger from '../utils/logger';

class RedisService {
  private client: Redis;
  public slidingWindowSha = '';
  public circuitBreakerSha = '';

  constructor() {
    this.client = new Redis({
      host:              config.redis.host,
      port:              config.redis.port,
      password:          config.redis.password,
      db:                config.redis.db,
      lazyConnect:       true,
      retryStrategy:     (times) => Math.min(times * 100, 3000),
      maxRetriesPerRequest: 3,
    });

    this.client.on('connect',          () => logger.info('[Redis] Connected'));
    this.client.on('ready',            () => logger.info('[Redis] Ready'));
    this.client.on('error',  (err)     => logger.error('[Redis] Error', { err: err.message }));
    this.client.on('reconnecting',     () => logger.warn('[Redis] Reconnecting…'));
  }

  async connect(): Promise<void> {
    await this.client.connect();
    await this.loadScripts();
  }

  private async loadScripts(): Promise<void> {
    const luaDir = path.join(__dirname, '..', 'lua');

    const swScript = fs.readFileSync(path.join(luaDir, 'slidingWindow.lua'), 'utf-8');
    this.slidingWindowSha = await this.client.script('LOAD', swScript) as string;
    logger.info('[Redis] Loaded slidingWindow.lua', { sha: this.slidingWindowSha });

    const cbScript = fs.readFileSync(path.join(luaDir, 'circuitBreaker.lua'), 'utf-8');
    this.circuitBreakerSha = await this.client.script('LOAD', cbScript) as string;
    logger.info('[Redis] Loaded circuitBreaker.lua', { sha: this.circuitBreakerSha });
  }

  getClient(): Redis {
    return this.client;
  }

  async ping(): Promise<boolean> {
    try {
      const pong = await this.client.ping();
      return pong === 'PONG';
    } catch {
      return false;
    }
  }

  async disconnect(): Promise<void> {
    await this.client.quit();
  }
}

// Singleton
export const redisService = new RedisService();
export default redisService;
