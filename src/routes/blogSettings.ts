import { Router } from 'express';
import { getBlogSettings, updateBlogSettings } from '../controllers/blogSettingsController';
import { authenticateToken, requireEditor } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { updateBlogSettingsSchema } from '../schemas/blogSettingsSchemas';

const router = Router();

// Public route to get blog settings
router.get('/', getBlogSettings);

// Protected route to update blog settings
router.put(
  '/',
  authenticateToken,
  requireEditor,
  validateRequest(updateBlogSettingsSchema),
  updateBlogSettings
);

export { router as blogSettingsRoutes };

