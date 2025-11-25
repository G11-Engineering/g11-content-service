import { Router } from 'express';
import { 
  getPosts, 
  getPostById, 
  createPost, 
  updatePost, 
  deletePost, 
  publishPost,
  schedulePost,
  getScheduledPosts,
  publishScheduledPosts,
  getPostVersions,
  createPostVersion,
  restorePostVersion,
  getPostVersion,
  getPostViews,
  incrementPostViews,
  getDrafts,
  saveDraft,
  deleteDraft
} from '../controllers/postController';
import { authenticateToken, requireAuthor, requireEditor } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { 
  createPostSchema, 
  updatePostSchema, 
  schedulePostSchema 
} from '../schemas/postSchemas';

const router = Router();

// Public routes
router.get('/', getPosts);
router.get('/:id', getPostById);

// Views (public - no auth required)
router.get('/:id/views', getPostViews);
router.post('/:id/views', incrementPostViews);

// Scheduled posts (public for cron jobs)
router.get('/scheduled/ready', getScheduledPosts);
router.post('/scheduled/publish', publishScheduledPosts);

// Development routes (no auth required)
router.post('/', validateRequest(createPostSchema), createPost);

// Protected routes
router.use(authenticateToken);

// Draft management (must come before /:id routes)
router.get('/drafts', requireAuthor, getDrafts);
router.post('/drafts', requireAuthor, saveDraft);
router.delete('/drafts/:id', requireAuthor, deleteDraft);
router.put('/:id', requireAuthor, validateRequest(updatePostSchema), updatePost);
router.delete('/:id', requireAuthor, deletePost);

// Publishing
router.post('/:id/publish', requireAuthor, publishPost);
router.post('/:id/schedule', requireAuthor, validateRequest(schedulePostSchema), schedulePost);

// Versioning
router.get('/:id/versions', requireAuthor, getPostVersions);
router.get('/:id/versions/:versionNumber', requireAuthor, getPostVersion);
router.post('/:id/versions', requireAuthor, createPostVersion);
router.post('/:id/versions/:versionNumber/restore', requireAuthor, restorePostVersion);

export { router as postRoutes };
