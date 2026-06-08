import mongoose from 'mongoose';
import { env } from './env';
import { logger } from '@/common/utils/logger';

mongoose.set('strictQuery', true);

export async function connectDB(): Promise<void> {
  try {
    await mongoose.connect(env.MONGODB_URI, {
      autoIndex: !env.isProduction, // production da indexlar migration orqali yaratiladi
      serverSelectionTimeoutMS: 10_000,
    });
    logger.info(`✓ MongoDB ulandi: ${maskUri(env.MONGODB_URI)}`);
  } catch (err) {
    logger.error('MongoDB ulanish xatosi:', err);
    process.exit(1);
  }
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
  logger.info('MongoDB ulanishi yopildi');
}

function maskUri(uri: string): string {
  return uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@');
}

// Graceful shutdown
mongoose.connection.on('error', (err) => logger.error('Mongoose error:', err));
mongoose.connection.on('disconnected', () => logger.warn('MongoDB uzildi'));
