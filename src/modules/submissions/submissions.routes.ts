import { Router } from 'express';
import { submissionsController } from './submissions.controller';
import { authMiddleware, requireRole } from '@/middleware/auth.middleware';
import { asyncHandler } from '@/middleware/async-handler';

const router = Router();

// All routes auth gated
router.use(authMiddleware);

// Create — worker, admin, developer
router.post('/lokomotiv', asyncHandler(submissionsController.createLokomotiv.bind(submissionsController)));
router.post('/korxona', asyncHandler(submissionsController.createKorxona.bind(submissionsController)));
router.post('/qurulish', asyncHandler(submissionsController.createQurulish.bind(submissionsController)));
router.post('/tamirlash', asyncHandler(submissionsController.createTamirlash.bind(submissionsController)));

// List
router.get('/', asyncHandler(submissionsController.list.bind(submissionsController)));

// Update (worker faqat shu kun, admin har qachon)
router.patch('/:id', asyncHandler(submissionsController.update.bind(submissionsController)));

// Delete — faqat admin
router.delete(
  '/:id',
  requireRole('admin', 'developer'),
  asyncHandler(submissionsController.remove.bind(submissionsController)),
);

// Offline sync
router.post('/offline-sync', asyncHandler(submissionsController.offlineSync.bind(submissionsController)));

export { router as submissionsRouter };
