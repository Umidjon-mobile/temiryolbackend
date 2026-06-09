import { createServer } from 'http';
import { createApp } from './app';
import { connectDB, disconnectDB } from './config/db';
import { initSocket } from './config/socket';
import { env } from './config/env';
import { logger } from './common/utils/logger';

async function bootstrap() {
  // 1. MongoDB ulanish
  await connectDB();

  // 2. Express app
  const app = createApp();

  // 3. HTTP server (Socket.io shu ustiga o'rnatiladi)
  const httpServer = createServer(app);

  // 4. Socket.io
  initSocket(httpServer);

  // 5. Listen
  httpServer.listen(env.PORT, () => {
    logger.success(
      `🚂 ${env.APP_NAME} ishga tushdi → http://localhost:${env.PORT} | env=${env.NODE_ENV}`,
    );
  });

  // ─── Graceful shutdown ──────────────────────────────
  const shutdown = async (signal: string) => {
    logger.warn(`${signal} qabul qilindi, server to'xtatilmoqda...`);
    httpServer.close(async () => {
      await disconnectDB();
      process.exit(0);
    });
    // 10s ichida yopilmasa, majburiy chiqamiz
    setTimeout(() => {
      logger.error('Yopilish vaqti tugadi — majburiy chiqish');
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection:', reason);
  });
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception:', err);
    process.exit(1);
  });
}

bootstrap().catch((err) => {
  logger.error('Bootstrap xatosi:', err);
  process.exit(1);
});
