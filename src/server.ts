import { createApp } from './app';
import { config } from './config';
import redisService from './services/redis.service';
import logger from './utils/logger';

async function bootstrap(): Promise<void> {
  // Connect to Redis and load Lua scripts before accepting traffic
  await redisService.connect();

  const app    = createApp();
  const server = app.listen(config.port, () => {
    logger.info(`🚀 API Gateway running on port ${config.port}`, {
      env:  config.env,
      port: config.port,
    });
  });

  // ── Graceful shutdown ─────────────────────────────────────────────
  const shutdown = async (signal: string) => {
    logger.info(`[Server] ${signal} received — shutting down gracefully…`);

    server.close(async () => {
      await redisService.disconnect();
      logger.info('[Server] Shutdown complete');
      process.exit(0);
    });

    // Force-kill after 10 s if connections don't drain
    setTimeout(() => {
      logger.error('[Server] Force-killing after timeout');
      process.exit(1);
    }, 10_000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error('[Server] Unhandled rejection', { reason });
  });

  process.on('uncaughtException', (err) => {
    logger.error('[Server] Uncaught exception', { err: err.message });
    process.exit(1);
  });
}

bootstrap().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
