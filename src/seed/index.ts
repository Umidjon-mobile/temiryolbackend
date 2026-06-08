/**
 * Seed script — boshlang'ich ma'lumotlarni MongoDB ga yozadi.
 *
 * Ishga tushirish:
 *   npm run seed
 *
 * Idempotent: qayta-qayta yugurtirsa duplicate xato bermaydi,
 * mavjud yozuvlarni yangilaydi.
 */

import { connectDB, disconnectDB } from '@/config/db';
import {
  NodeModel,
  StationModel,
  UserModel,
  BlockedCodeModel,
} from '@/models';
import { env } from '@/config/env';
import { logger } from '@/common/utils/logger';
import { NODES } from './nodes.data';
import { STATIONS } from './stations.data';

async function seedNodes() {
  logger.info(`Nodes seeding: ${NODES.length} ta`);
  for (const node of NODES) {
    await NodeModel.updateOne(
      { _id: node.id },
      { $set: node },
      { upsert: true },
    );
  }
  logger.success(`✓ ${NODES.length} ta node yozildi`);
}

async function seedStations() {
  logger.info(`Stations seeding: ${STATIONS.length} ta`);
  for (const st of STATIONS) {
    await StationModel.updateOne(
      { _id: st.id },
      {
        $set: {
          _id: st.id,
          nodeId: st.nodeId,
          name: st.name,
          slug: st.slug,
          isActive: true,
        },
      },
      { upsert: true },
    );
  }
  logger.success(`✓ ${STATIONS.length} ta station yozildi`);
}

async function seedWorkerCodes() {
  let total = 0;
  for (const st of STATIONS) {
    // Asosiy ishchi kodlari
    for (const code of st.workerCodes) {
      await UserModel.updateOne(
        { code },
        {
          $set: {
            code,
            role: 'worker',
            displayName: `${st.name} ishchisi`,
            nodeId: st.nodeId,
            stationId: st.id,
            codeType: 'main',
            isActive: true,
          },
        },
        { upsert: true },
      );
      total++;
    }
    // Zaxira kodlari
    for (const code of st.reserveCodes) {
      // Bir xil kod ikki stationda bo'lishi mumkin — birinchisini yozamiz
      const existing = await UserModel.findOne({ code }).lean();
      if (existing) continue;
      await UserModel.create({
        code,
        role: 'worker',
        displayName: `${st.name} (Zaxira)`,
        nodeId: st.nodeId,
        stationId: st.id,
        codeType: 'reserve',
        isActive: true,
      });
      total++;
    }
  }
  logger.success(`✓ ${total} ta worker kodi yozildi`);
}

async function seedAdminCodes() {
  // Admin
  await UserModel.updateOne(
    { code: env.SEED_ADMIN_CODE },
    {
      $set: {
        code: env.SEED_ADMIN_CODE,
        role: 'admin',
        displayName: env.SEED_ADMIN_NAME,
        nodeId: null,
        stationId: null,
        codeType: 'admin',
        isActive: true,
      },
    },
    { upsert: true },
  );

  // Developer
  await UserModel.updateOne(
    { code: env.SEED_DEVELOPER_CODE },
    {
      $set: {
        code: env.SEED_DEVELOPER_CODE,
        role: 'developer',
        displayName: env.SEED_DEVELOPER_NAME,
        nodeId: null,
        stationId: null,
        codeType: 'developer',
        isActive: true,
      },
    },
    { upsert: true },
  );

  logger.success(
    `✓ Admin (${env.SEED_ADMIN_CODE}) va Developer (${env.SEED_DEVELOPER_CODE}) kodlari yozildi`,
  );
}

async function ensureIndexes() {
  await Promise.all([
    NodeModel.syncIndexes(),
    StationModel.syncIndexes(),
    UserModel.syncIndexes(),
    BlockedCodeModel.syncIndexes(),
  ]);
  logger.success('✓ Indexlar sinxronlandi');
}

async function main() {
  logger.info('═══════════════════════════════════════════');
  logger.info('  SEED — boshlang\'ich ma\'lumotlar');
  logger.info('═══════════════════════════════════════════');

  await connectDB();

  try {
    await seedNodes();
    await seedStations();
    await seedWorkerCodes();
    await seedAdminCodes();
    await ensureIndexes();

    logger.success('═══════════════════════════════════════════');
    logger.success('  ✓ Seed muvaffaqiyatli yakunlandi');
    logger.success('═══════════════════════════════════════════');
    logger.info(`  Admin kod:     ${env.SEED_ADMIN_CODE}`);
    logger.info(`  Developer kod: ${env.SEED_DEVELOPER_CODE}`);
    logger.info('  Worker kodlari: stations.data.ts da');
  } finally {
    await disconnectDB();
  }
}

main().catch((err) => {
  logger.error('Seed xato:', err);
  process.exit(1);
});
