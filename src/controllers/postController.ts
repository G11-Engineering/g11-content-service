import { Request, Response, NextFunction } from 'express';
import slugify from 'slugify';
import axios from 'axios';
import { getDatabase } from '../config/database';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';

// Helper function to validate tags exist and are active
const validateTags = async (tagIds: string[]): Promise<void> => {
  if (tagIds.length === 0) return;
  
  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  for (const tagId of tagIds) {
    if (!uuidRegex.test(tagId)) {
      throw new Error(`Invalid tag ID format: ${tagId}`);
    }
  }
  
  const categoryServiceUrl = process.env.CATEGORY_SERVICE_URL || 'http://category-service:3004';
  const tagValidationPromises = tagIds.map(async (tagId: string) => {
    try {
      // Use axios for better error handling and timeout support
      const response = await axios.get(`${categoryServiceUrl}/api/tags/${tagId}`, {
        timeout: 5000, // 5 second timeout
        headers: {
          'Content-Type': 'application/json',
        },
        validateStatus: (status) => status < 500, // Don't throw on 4xx errors
      });
      
      if (response.status === 404) {
        throw new Error(`Tag with ID ${tagId} not found`);
      }
      
      if (response.status !== 200) {
        throw new Error(`Failed to validate tag ${tagId}: ${response.statusText || 'Unknown error'}`);
      }
      
      const tagData = response.data;
      if (!tagData || !tagData.tag) {
        throw new Error(`Tag with ID ${tagId} not found`);
      }
      
      if (!tagData.tag.is_active) {
        throw new Error(`Tag "${tagData.tag.name}" is not active`);
      }
      
      return tagId;
    } catch (error: any) {
      // Handle axios timeout errors
      if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        throw new Error(`Timeout while validating tag ${tagId}. Please check if the category service is running at ${categoryServiceUrl}`);
      }
      
      // Handle connection errors
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        throw new Error(`Cannot connect to category service at ${categoryServiceUrl}. Please ensure the service is running.`);
      }
      
      // Handle axios HTTP errors
      if (error.response) {
        if (error.response.status === 404) {
          throw new Error(`Tag with ID ${tagId} not found`);
        }
        throw new Error(`Failed to validate tag ${tagId}: ${error.response.statusText || 'Unknown error'}`);
      }
      
      // Handle other errors
      if (error.message) {
        throw new Error(`Invalid tag ID ${tagId}: ${error.message}`);
      }
      
      throw new Error(`Invalid tag ID ${tagId}: Unknown error occurred`);
    }
  });
  
  await Promise.all(tagValidationPromises);
};

// Helper function to get post with all relationships
const getPostWithRelations = async (client: any, postId: string) => {
  const postResult = await client.query(`
    SELECT p.*
    FROM posts p
    WHERE p.id = $1
  `, [postId]);

  if (postResult.rows.length === 0) {
    return null;
  }

  const post = postResult.rows[0];

  // Get categories (if category service is available)
  try {
    const categoriesResult = await client.query(`
      SELECT c.id, c.name, c.slug
      FROM categories c
      JOIN post_categories pc ON c.id = pc.category_id
      WHERE pc.post_id = $1
    `, [postId]);
    post.categories = categoriesResult.rows;
  } catch (error) {
    post.categories = [];
  }

  // Get tags (if tag service is available)
  try {
    const tagsResult = await client.query(`
      SELECT t.id, t.name, t.slug
      FROM tags t
      JOIN post_tags pt ON t.id = pt.tag_id
      WHERE pt.post_id = $1
    `, [postId]);
    post.tags = tagsResult.rows;
  } catch (error) {
    post.tags = [];
  }

  // Get view count
  const viewResult = await client.query(`
    SELECT COUNT(*) as view_count
    FROM post_views 
    WHERE post_id = $1
  `, [postId]);

  post.view_count = parseInt(viewResult.rows[0].view_count);

  return post;
};

export const getPosts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const db = getDatabase();
    const { 
      page = 1, 
      limit = 10, 
      status, 
      authorId, 
      categoryId, 
      tagId, 
      search,
      sortBy = 'published_at',
      sortOrder = 'desc',
      includeDrafts = false
    } = req.query;

    // Validate pagination parameters
    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(100, Math.max(1, Number(limit)));

    let query = `
      SELECT p.id, p.title, p.slug, p.excerpt, p.author_id, p.status, 
             p.featured_image_url, p.meta_title, p.meta_description,
             p.published_at, p.scheduled_at, p.created_at, p.updated_at,
             COUNT(pv.id) as view_count
      FROM posts p
      LEFT JOIN post_views pv ON p.id = pv.post_id
    `;
    
    const conditions: string[] = [];
    const params: any[] = [];
    let paramCount = 0;

    // Status filter - if no status specified, show published by default unless includeDrafts is true
    if (status) {
      paramCount++;
      conditions.push(`p.status = $${paramCount}`);
      params.push(status);
    } else if (!includeDrafts) {
      paramCount++;
      conditions.push(`p.status = 'published'`);
    }

    // Author filter
    if (authorId) {
      paramCount++;
      conditions.push(`p.author_id = $${paramCount}`);
      params.push(authorId);
    }

    // Category filter
    if (categoryId) {
      paramCount++;
      conditions.push(`EXISTS (SELECT 1 FROM post_categories pc WHERE pc.post_id = p.id AND pc.category_id = $${paramCount})`);
      params.push(categoryId);
    }

    // Tag filter
    if (tagId) {
      paramCount++;
      conditions.push(`EXISTS (SELECT 1 FROM post_tags pt WHERE pt.post_id = p.id AND pt.tag_id = $${paramCount})`);
      params.push(tagId);
    }

    // Search filter - improved search
    if (search) {
      paramCount++;
      conditions.push(`(
        p.title ILIKE $${paramCount} OR 
        p.content ILIKE $${paramCount} OR 
        p.excerpt ILIKE $${paramCount} OR
        p.meta_title ILIKE $${paramCount} OR
        p.meta_description ILIKE $${paramCount}
      )`);
      params.push(`%${search}%`);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' GROUP BY p.id';

    // Enhanced sorting
    const validSortFields = ['created_at', 'updated_at', 'published_at', 'scheduled_at', 'title', 'view_count'];
    const sortField = validSortFields.includes(sortBy as string) ? sortBy : 'published_at';
    const order = sortOrder === 'asc' ? 'ASC' : 'DESC';
    
    if (sortField === 'view_count') {
      query += ` ORDER BY COUNT(pv.id) ${order}, p.published_at DESC`;
    } else {
      query += ` ORDER BY p.${sortField} ${order}`;
    }

    // Pagination
    const offset = (pageNum - 1) * limitNum;
    paramCount++;
    query += ` LIMIT $${paramCount}`;
    params.push(limitNum);
    
    paramCount++;
    query += ` OFFSET $${paramCount}`;
    params.push(offset);

    const result = await db.query(query, params);

    // Get total count with same conditions
    let countQuery = `
      SELECT COUNT(DISTINCT p.id) 
      FROM posts p
    `;
    if (conditions.length > 0) {
      countQuery += ' WHERE ' + conditions.join(' AND ');
    }
    const countResult = await db.query(countQuery, params.slice(0, -2));

    const total = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(total / limitNum);

    res.json({
      posts: result.rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: totalPages,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1
      }
    });
  } catch (error) {
    console.error('Error fetching posts:', error);
    next(error);
  }
};

export const getPostById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const db = getDatabase();

    const result = await db.query(`
      SELECT p.*, COUNT(pv.id) as view_count
      FROM posts p
      LEFT JOIN post_views pv ON p.id = pv.post_id
      WHERE p.id = $1
      GROUP BY p.id
    `, [id]);

    if (result.rows.length === 0) {
      throw createError('Post not found', 404);
    }

    const post = result.rows[0];
    
    // Get categories
    try {
      const categoriesResult = await db.query(`
        SELECT c.id, c.name, c.slug
        FROM categories c
        JOIN post_categories pc ON c.id = pc.category_id
        WHERE pc.post_id = $1
      `, [id]);
      post.categories = categoriesResult.rows;
    } catch (error) {
      post.categories = [];
    }

    // Get tags
    try {
      const tagsResult = await db.query(`
        SELECT t.id, t.name, t.slug
        FROM tags t
        JOIN post_tags pt ON t.id = pt.tag_id
        WHERE pt.post_id = $1
      `, [id]);
      post.tags = tagsResult.rows;
    } catch (error) {
      post.tags = [];
    }

    res.json({ post });
  } catch (error) {
    next(error);
  }
};

export const createPost = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  const client = await getDatabase().connect();
  
  try {
    await client.query('BEGIN');
    
    const { 
      title, 
      content, 
      excerpt, 
      featuredImageUrl, 
      metaTitle, 
      metaDescription, 
      categories = [], 
      tags = [],
      status = 'draft',
      scheduledAt
    } = req.body;

    // Validate required fields
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      throw createError('Title is required and cannot be empty', 400);
    }
    
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      throw createError('Content is required and cannot be empty', 400);
    }
    
    // Validate title length
    if (title.trim().length > 500) {
      throw createError('Title must be 500 characters or less', 400);
    }

    // Generate unique slug
    const baseSlug = slugify(title, { lower: true, strict: true, remove: /[*+~.()'"!:@]/g });
    let slug = baseSlug;
    let counter = 1;

    while (true) {
      const existingPost = await client.query('SELECT id FROM posts WHERE slug = $1', [slug]);
      if (existingPost.rows.length === 0) break;
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    // Validate status
    const validStatuses = ['draft', 'published', 'scheduled', 'archived'];
    const postStatus = validStatuses.includes(status) ? status : 'draft';

    // Create post
    const authorId = req.user?.id || '00000000-0000-0000-0000-000000000001'; // Default user ID for development
    const result = await client.query(`
      INSERT INTO posts (
        title, slug, content, excerpt, author_id, status,
        featured_image_url, meta_title, meta_description, scheduled_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      title, slug, content, excerpt, authorId, postStatus,
      featuredImageUrl, metaTitle, metaDescription, scheduledAt
    ]);

    const post = result.rows[0];

    // Set published_at if status is published
    if (postStatus === 'published') {
      await client.query(
        'UPDATE posts SET published_at = CURRENT_TIMESTAMP WHERE id = $1',
        [post.id]
      );
    }

    // Add categories with validation
    if (categories && categories.length > 0) {
      for (const categoryId of categories) {
        // Validate category exists (you might want to check against category service)
        await client.query(
          'INSERT INTO post_categories (post_id, category_id) VALUES ($1, $2)',
          [post.id, categoryId]
        );
      }
    }

    // Add tags with validation
    if (tags && tags.length > 0) {
      try {
        await validateTags(tags);
        
        // If all validations pass, insert tags
        for (const tagId of tags) {
          await client.query(
            'INSERT INTO post_tags (post_id, tag_id) VALUES ($1, $2)',
            [post.id, tagId]
          );
        }
      } catch (error: any) {
        throw createError(error.message || 'Failed to validate tags', 400);
      }
    }

    // Create initial version
    await client.query(`
      INSERT INTO post_versions (post_id, title, content, excerpt, version_number, created_by)
      VALUES ($1, $2, $3, $4, 1, $5)
    `, [post.id, title, content, excerpt, authorId]);

    await client.query('COMMIT');

    // Fetch the complete post with relationships
    const completePost = await getPostWithRelations(client, post.id);
    
    res.status(201).json({ 
      post: completePost,
      message: `Post created successfully as ${postStatus}`
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating post:', error);
    next(error);
  } finally {
    client.release();
  }
};

export const updatePost = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  const client = await getDatabase().connect();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    const { 
      title, 
      content, 
      excerpt, 
      featuredImageUrl, 
      metaTitle, 
      metaDescription, 
      categories, 
      tags,
      status,
      createVersion = true
    } = req.body;

    // Check if post exists and user has permission
    const existingPost = await client.query('SELECT author_id, status FROM posts WHERE id = $1', [id]);
    if (existingPost.rows.length === 0) {
      throw createError('Post not found', 404);
    }

    // Allow update if user is the author OR is admin/editor
    const isAuthor = existingPost.rows[0].author_id === req.user!.id;
    const isAdminOrEditor = ['admin', 'editor'].includes(req.user!.role);
    
    if (!isAuthor && !isAdminOrEditor) {
      throw createError('Not authorized to update this post', 403);
    }

    // Create version before update if requested
    if (createVersion && (title || content || excerpt)) {
      const currentPost = await client.query('SELECT title, content, excerpt FROM posts WHERE id = $1', [id]);
      if (currentPost.rows.length > 0) {
        const current = currentPost.rows[0];
        
        // Get next version number
        const versionResult = await client.query(
          'SELECT MAX(version_number) as max_version FROM post_versions WHERE post_id = $1',
          [id]
        );
        const nextVersion = (versionResult.rows[0].max_version || 0) + 1;

        // Create version
        await client.query(`
          INSERT INTO post_versions (post_id, title, content, excerpt, version_number, created_by)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [id, current.title, current.content, current.excerpt, nextVersion, req.user!.id]);
      }
    }

    // Generate new slug if title changed
    let slug = existingPost.rows[0].slug;
    if (title) {
      const baseSlug = slugify(title, { lower: true, strict: true, remove: /[*+~.()'"!:@]/g });
      slug = baseSlug;
      let counter = 1;

      while (true) {
        const existingSlug = await client.query('SELECT id FROM posts WHERE slug = $1 AND id != $2', [slug, id]);
        if (existingSlug.rows.length === 0) break;
        slug = `${baseSlug}-${counter}`;
        counter++;
      }
    }

    // Update post
    const updateFields = [];
    const updateValues = [];
    let paramCount = 0;

    if (title !== undefined) {
      paramCount++;
      updateFields.push(`title = $${paramCount}`);
      updateValues.push(title);
    }
    // Always update content if provided (even if empty string)
    if (content !== undefined && content !== null) {
      paramCount++;
      updateFields.push(`content = $${paramCount}`);
      updateValues.push(content);
    }
    if (excerpt !== undefined) {
      paramCount++;
      updateFields.push(`excerpt = $${paramCount}`);
      updateValues.push(excerpt);
    }
    if (featuredImageUrl !== undefined) {
      paramCount++;
      updateFields.push(`featured_image_url = $${paramCount}`);
      updateValues.push(featuredImageUrl);
    }
    if (metaTitle !== undefined) {
      paramCount++;
      updateFields.push(`meta_title = $${paramCount}`);
      updateValues.push(metaTitle);
    }
    if (metaDescription !== undefined) {
      paramCount++;
      updateFields.push(`meta_description = $${paramCount}`);
      updateValues.push(metaDescription);
    }
    if (status !== undefined) {
      paramCount++;
      updateFields.push(`status = $${paramCount}`);
      updateValues.push(status);
      
      // Set published_at if status is being changed to published
      // Note: CURRENT_TIMESTAMP is a SQL function, not a parameter, so don't increment paramCount
      if (status === 'published') {
        updateFields.push(`published_at = CURRENT_TIMESTAMP`);
      }
    }

    if (title) {
      paramCount++;
      updateFields.push(`slug = $${paramCount}`);
      updateValues.push(slug);
    }

    // updated_at is also a SQL function, not a parameter
    updateFields.push('updated_at = CURRENT_TIMESTAMP');
    
    // Add id as the last parameter
    paramCount++;
    updateValues.push(id);

    const result = await client.query(`
      UPDATE posts 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `, updateValues);

    // Update categories
    if (categories !== undefined) {
      await client.query('DELETE FROM post_categories WHERE post_id = $1', [id]);
      if (categories.length > 0) {
        for (const categoryId of categories) {
          await client.query(
            'INSERT INTO post_categories (post_id, category_id) VALUES ($1, $2)',
            [id, categoryId]
          );
        }
      }
    }

    // Update tags
    if (tags !== undefined) {
      await client.query('DELETE FROM post_tags WHERE post_id = $1', [id]);
      if (tags.length > 0) {
        try {
          await validateTags(tags);
          
          // If all validations pass, insert tags
          for (const tagId of tags) {
            await client.query(
              'INSERT INTO post_tags (post_id, tag_id) VALUES ($1, $2)',
              [id, tagId]
            );
          }
        } catch (error: any) {
          throw createError(error.message || 'Failed to validate tags', 400);
        }
      }
    }

    await client.query('COMMIT');

    // Fetch the complete post with relationships
    const completePost = await getPostWithRelations(client, id);
    
    res.json({ 
      post: completePost,
      message: 'Post updated successfully'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating post:', error);
    next(error);
  } finally {
    client.release();
  }
};

export const deletePost = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  const client = await getDatabase().connect();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;

    // Check if post exists and user has permission
    const existingPost = await client.query('SELECT author_id FROM posts WHERE id = $1', [id]);
    if (existingPost.rows.length === 0) {
      throw createError('Post not found', 404);
    }

    const isAuthor = existingPost.rows[0].author_id === req.user!.id;
    const isAdminOrEditor = ['admin', 'editor'].includes(req.user!.role);
    
    if (!isAuthor && !isAdminOrEditor) {
      throw createError('Not authorized to delete this post', 403);
    }

    // Delete related records explicitly (though CASCADE should handle this)
    // This ensures clean deletion even if foreign keys aren't set up correctly
    await client.query('DELETE FROM post_views WHERE post_id = $1', [id]);
    await client.query('DELETE FROM post_tags WHERE post_id = $1', [id]);
    await client.query('DELETE FROM post_categories WHERE post_id = $1', [id]);
    await client.query('DELETE FROM post_versions WHERE post_id = $1', [id]);
    await client.query('DELETE FROM posts WHERE id = $1', [id]);

    await client.query('COMMIT');
    res.json({ message: 'Post deleted successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
};

export const publishPost = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const db = getDatabase();

    // Check if post exists and user has permission
    const existingPost = await db.query('SELECT author_id, status FROM posts WHERE id = $1', [id]);
    if (existingPost.rows.length === 0) {
      throw createError('Post not found', 404);
    }

    if (existingPost.rows[0].author_id !== req.user!.id && !['admin', 'editor'].includes(req.user!.role)) {
      throw createError('Not authorized to publish this post', 403);
    }

    const result = await db.query(`
      UPDATE posts 
      SET status = 'published', published_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `, [id]);

    res.json({ post: result.rows[0] });
  } catch (error) {
    next(error);
  }
};

export const schedulePost = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const { scheduledAt } = req.body;
    const db = getDatabase();

    // Validate scheduledAt
    const scheduleDate = new Date(scheduledAt);
    if (isNaN(scheduleDate.getTime())) {
      throw createError('Invalid scheduled date', 400);
    }

    if (scheduleDate <= new Date()) {
      throw createError('Scheduled date must be in the future', 400);
    }

    // Check if post exists and user has permission
    const existingPost = await db.query('SELECT author_id, status FROM posts WHERE id = $1', [id]);
    if (existingPost.rows.length === 0) {
      throw createError('Post not found', 404);
    }

    if (existingPost.rows[0].author_id !== req.user!.id && !['admin', 'editor'].includes(req.user!.role)) {
      throw createError('Not authorized to schedule this post', 403);
    }

    // Only allow scheduling of draft posts
    if (existingPost.rows[0].status !== 'draft') {
      throw createError('Only draft posts can be scheduled', 400);
    }

    const result = await db.query(`
      UPDATE posts 
      SET status = 'scheduled', scheduled_at = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `, [scheduledAt, id]);

    res.json({ 
      post: result.rows[0],
      message: `Post scheduled for ${scheduleDate.toISOString()}`
    });
  } catch (error) {
    next(error);
  }
};

// New function to get scheduled posts
export const getScheduledPosts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const db = getDatabase();
    const { limit = 50 } = req.query;

    const result = await db.query(`
      SELECT p.id, p.title, p.slug, p.scheduled_at, p.author_id
      FROM posts p
      WHERE p.status = 'scheduled' AND p.scheduled_at <= $1
      ORDER BY p.scheduled_at ASC
      LIMIT $2
    `, [new Date(), Number(limit)]);

    res.json({ 
      scheduledPosts: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    next(error);
  }
};

// New function to publish scheduled posts
export const publishScheduledPosts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const db = getDatabase();
    const now = new Date();

    // Get posts that are scheduled and ready to publish
    const scheduledPosts = await db.query(`
      SELECT id, title, scheduled_at
      FROM posts 
      WHERE status = 'scheduled' AND scheduled_at <= $1
      ORDER BY scheduled_at ASC
    `, [now]);

    const publishedPosts = [];

    for (const post of scheduledPosts.rows) {
      try {
        await db.query('BEGIN');
        
        // Update post status to published
        await db.query(`
          UPDATE posts 
          SET status = 'published', published_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
        `, [post.id]);

        await db.query('COMMIT');
        publishedPosts.push({
          id: post.id,
          title: post.title,
          publishedAt: now
        });
      } catch (error) {
        await db.query('ROLLBACK');
        console.error(`Failed to publish scheduled post ${post.id}:`, error);
      }
    }

    res.json({ 
      message: `Published ${publishedPosts.length} scheduled posts`,
      publishedPosts
    });
  } catch (error) {
    next(error);
  }
};

export const getPostVersions = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 10 } = req.query;
    const db = getDatabase();

    // Check if post exists and user has permission
    const postResult = await db.query('SELECT author_id FROM posts WHERE id = $1', [id]);
    if (postResult.rows.length === 0) {
      throw createError('Post not found', 404);
    }

    if (postResult.rows[0].author_id !== req.user!.id && !['admin', 'editor'].includes(req.user!.role)) {
      throw createError('Not authorized to view versions of this post', 403);
    }

    const offset = (Number(page) - 1) * Number(limit);

    const result = await db.query(`
      SELECT pv.*
      FROM post_versions pv
      WHERE pv.post_id = $1 
      ORDER BY pv.version_number DESC
      LIMIT $2 OFFSET $3
    `, [id, Number(limit), offset]);

    // Get total count
    const countResult = await db.query(
      'SELECT COUNT(*) FROM post_versions WHERE post_id = $1',
      [id]
    );

    const total = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(total / Number(limit));

    res.json({ 
      versions: result.rows,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: totalPages
      }
    });
  } catch (error) {
    next(error);
  }
};

export const createPostVersion = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const { title, content, excerpt, description } = req.body;
    const db = getDatabase();

    // Get current post
    const postResult = await db.query('SELECT author_id FROM posts WHERE id = $1', [id]);
    if (postResult.rows.length === 0) {
      throw createError('Post not found', 404);
    }

    if (postResult.rows[0].author_id !== req.user!.id && !['admin', 'editor'].includes(req.user!.role)) {
      throw createError('Not authorized to create versions of this post', 403);
    }

    // Get next version number
    const versionResult = await db.query(
      'SELECT MAX(version_number) as max_version FROM post_versions WHERE post_id = $1',
      [id]
    );
    const nextVersion = (versionResult.rows[0].max_version || 0) + 1;

    // Create version
    const result = await db.query(`
      INSERT INTO post_versions (post_id, title, content, excerpt, version_number, created_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [id, title, content, excerpt, nextVersion, req.user!.id]);

    res.status(201).json({ 
      version: result.rows[0],
      message: `Version ${nextVersion} created successfully`
    });
  } catch (error) {
    next(error);
  }
};

// New function to restore a version
export const restorePostVersion = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  const client = await getDatabase().connect();
  
  try {
    await client.query('BEGIN');
    
    const { id, versionNumber } = req.params;
    const db = getDatabase();

    // Check if post exists and user has permission
    const postResult = await client.query('SELECT author_id FROM posts WHERE id = $1', [id]);
    if (postResult.rows.length === 0) {
      throw createError('Post not found', 404);
    }

    if (postResult.rows[0].author_id !== req.user!.id && !['admin', 'editor'].includes(req.user!.role)) {
      throw createError('Not authorized to restore versions of this post', 403);
    }

    // Get the version to restore
    const versionResult = await client.query(
      'SELECT * FROM post_versions WHERE post_id = $1 AND version_number = $2',
      [id, versionNumber]
    );

    if (versionResult.rows.length === 0) {
      throw createError('Version not found', 404);
    }

    const version = versionResult.rows[0];

    // Create a new version from current post before restoring
    const currentPost = await client.query('SELECT title, content, excerpt FROM posts WHERE id = $1', [id]);
    if (currentPost.rows.length > 0) {
      const current = currentPost.rows[0];
      
      // Get next version number
      const maxVersionResult = await client.query(
        'SELECT MAX(version_number) as max_version FROM post_versions WHERE post_id = $1',
        [id]
      );
      const nextVersion = (maxVersionResult.rows[0].max_version || 0) + 1;

      // Create backup version
      await client.query(`
        INSERT INTO post_versions (post_id, title, content, excerpt, version_number, created_by)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [id, current.title, current.content, current.excerpt, nextVersion, req.user!.id]);
    }

    // Restore the post from the version
    await client.query(`
      UPDATE posts 
      SET title = $1, content = $2, excerpt = $3, updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
    `, [version.title, version.content, version.excerpt, id]);

    await client.query('COMMIT');

    // Fetch the updated post
    const updatedPost = await getPostWithRelations(client, id);

    res.json({ 
      post: updatedPost,
      message: `Post restored to version ${versionNumber}`
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error restoring post version:', error);
    next(error);
  } finally {
    client.release();
  }
};

// New function to get a specific version
export const getPostVersion = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id, versionNumber } = req.params;
    const db = getDatabase();

    // Check if post exists and user has permission
    const postResult = await db.query('SELECT author_id FROM posts WHERE id = $1', [id]);
    if (postResult.rows.length === 0) {
      throw createError('Post not found', 404);
    }

    if (postResult.rows[0].author_id !== req.user!.id && !['admin', 'editor'].includes(req.user!.role)) {
      throw createError('Not authorized to view versions of this post', 403);
    }

    const result = await db.query(`
      SELECT pv.*
      FROM post_versions pv
      WHERE pv.post_id = $1 AND pv.version_number = $2
    `, [id, versionNumber]);

    if (result.rows.length === 0) {
      throw createError('Version not found', 404);
    }

    res.json({ version: result.rows[0] });
  } catch (error) {
    next(error);
  }
};

export const getPostViews = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const db = getDatabase();

    const result = await db.query(`
      SELECT COUNT(*) as view_count
      FROM post_views 
      WHERE post_id = $1
    `, [id]);

    res.json({ viewCount: parseInt(result.rows[0].view_count) });
  } catch (error) {
    next(error);
  }
};

export const incrementPostViews = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const db = getDatabase();

    // Check if post exists
    const postResult = await db.query('SELECT id FROM posts WHERE id = $1', [id]);
    if (postResult.rows.length === 0) {
      throw createError('Post not found', 404);
    }

    // Record view
    await db.query(`
      INSERT INTO post_views (post_id, ip_address, user_agent)
      VALUES ($1, $2, $3)
    `, [id, req.ip, req.get('User-Agent')]);

    res.json({ message: 'View recorded' });
  } catch (error) {
    next(error);
  }
};

// Draft management functions
export const getDrafts = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { page = 1, limit = 10, authorId } = req.query;
    const db = getDatabase();

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(100, Math.max(1, Number(limit)));
    const offset = (pageNum - 1) * limitNum;

    let query = `
      SELECT p.id, p.title, p.slug, p.excerpt, p.author_id, p.status,
             p.featured_image_url, p.created_at, p.updated_at
      FROM posts p
      WHERE p.status = 'draft'
    `;

    const params: any[] = [];
    let paramCount = 0;

    // Filter by author if specified
    if (authorId) {
      paramCount++;
      query += ` AND p.author_id = $${paramCount}`;
      params.push(authorId);
    }

    // If user is not admin/editor, only show their own drafts
    if (!['admin', 'editor'].includes(req.user!.role)) {
      paramCount++;
      query += ` AND p.author_id = $${paramCount}`;
      params.push(req.user!.id);
    }

    query += ` ORDER BY p.updated_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(limitNum, offset);

    const result = await db.query(query, params);

    // Get total count
    let countQuery = `
      SELECT COUNT(*) FROM posts p
      WHERE p.status = 'draft'
    `;
    const countParams = params.slice(0, -2);
    
    if (authorId) {
      countQuery += ` AND p.author_id = $1`;
    }
    if (!['admin', 'editor'].includes(req.user!.role)) {
      const authorParamIndex = authorId ? 2 : 1;
      countQuery += ` AND p.author_id = $${authorParamIndex}`;
      countParams.push(req.user!.id);
    }

    const countResult = await db.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(total / limitNum);

    res.json({
      drafts: result.rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: totalPages,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1
      }
    });
  } catch (error) {
    next(error);
  }
};

export const saveDraft = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { 
      title, 
      content, 
      excerpt, 
      featuredImageUrl, 
      metaTitle, 
      metaDescription, 
      categories = [], 
      tags = [],
      postId 
    } = req.body;

    const db = getDatabase();

    if (postId) {
      // Update existing draft
      const existingPost = await db.query('SELECT author_id FROM posts WHERE id = $1', [postId]);
      if (existingPost.rows.length === 0) {
        throw createError('Post not found', 404);
      }

      if (existingPost.rows[0].author_id !== req.user!.id && !['admin', 'editor'].includes(req.user!.role)) {
        throw createError('Not authorized to update this post', 403);
      }

      // Update the post
      await db.query(`
        UPDATE posts 
        SET title = $1, content = $2, excerpt = $3, featured_image_url = $4,
            meta_title = $5, meta_description = $6, updated_at = CURRENT_TIMESTAMP
        WHERE id = $7
      `, [title, content, excerpt, featuredImageUrl, metaTitle, metaDescription, postId]);

      res.json({ 
        message: 'Draft updated successfully',
        postId 
      });
    } else {
      // Create new draft
      const baseSlug = slugify(title, { lower: true, strict: true, remove: /[*+~.()'"!:@]/g });
      let slug = baseSlug;
      let counter = 1;

      while (true) {
        const existingPost = await db.query('SELECT id FROM posts WHERE slug = $1', [slug]);
        if (existingPost.rows.length === 0) break;
        slug = `${baseSlug}-${counter}`;
        counter++;
      }

      const result = await db.query(`
        INSERT INTO posts (title, slug, content, excerpt, author_id, status, featured_image_url, meta_title, meta_description)
        VALUES ($1, $2, $3, $4, $5, 'draft', $6, $7, $8)
        RETURNING id
      `, [title, slug, content, excerpt, req.user!.id, featuredImageUrl, metaTitle, metaDescription]);

      const newPostId = result.rows[0].id;

      // Add categories and tags
      if (categories.length > 0) {
        for (const categoryId of categories) {
          await db.query(
            'INSERT INTO post_categories (post_id, category_id) VALUES ($1, $2)',
            [newPostId, categoryId]
          );
        }
      }

      if (tags.length > 0) {
        try {
          await validateTags(tags);
          
          // If all validations pass, insert tags
          for (const tagId of tags) {
            await db.query(
              'INSERT INTO post_tags (post_id, tag_id) VALUES ($1, $2)',
              [newPostId, tagId]
            );
          }
        } catch (error: any) {
          throw createError(error.message || 'Failed to validate tags', 400);
        }
      }

      res.status(201).json({ 
        message: 'Draft created successfully',
        postId: newPostId 
      });
    }
  } catch (error) {
    next(error);
  }
};

export const deleteDraft = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const db = getDatabase();

    // Check if post exists and user has permission
    const existingPost = await db.query('SELECT author_id, status FROM posts WHERE id = $1', [id]);
    if (existingPost.rows.length === 0) {
      throw createError('Post not found', 404);
    }

    if (existingPost.rows[0].author_id !== req.user!.id && !['admin', 'editor'].includes(req.user!.role)) {
      throw createError('Not authorized to delete this post', 403);
    }

    if (existingPost.rows[0].status !== 'draft') {
      throw createError('Only draft posts can be deleted', 400);
    }

    await db.query('DELETE FROM posts WHERE id = $1', [id]);

    res.json({ message: 'Draft deleted successfully' });
  } catch (error) {
    next(error);
  }
};
