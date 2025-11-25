import Joi from 'joi';

export const createPostSchema = Joi.object({
  title: Joi.string().min(1).max(500).required(),
  slug: Joi.string().min(1).max(500).allow(''),
  content: Joi.string().min(1).required(),
  excerpt: Joi.string().max(1000).allow(''),
  featuredImageUrl: Joi.string().uri().allow(''),
  metaTitle: Joi.string().max(200).allow(''),
  metaDescription: Joi.string().max(500).allow(''),
  categories: Joi.array().items(Joi.string().uuid()).default([]),
  tags: Joi.array().items(Joi.string().uuid()).default([]),
  status: Joi.string().valid('draft', 'published', 'scheduled', 'archived').default('draft'),
  scheduledAt: Joi.date().iso().greater('now').optional()
});

export const updatePostSchema = Joi.object({
  title: Joi.string().min(1).max(500),
  content: Joi.string().min(1).allow(''), // Allow empty but require string
  excerpt: Joi.string().max(1000).allow(''),
  featuredImageUrl: Joi.string().uri().allow(''),
  metaTitle: Joi.string().max(200).allow(''),
  metaDescription: Joi.string().max(500).allow(''),
  categories: Joi.array().items(Joi.string().uuid()),
  tags: Joi.array().items(Joi.string().uuid()),
  status: Joi.string().valid('draft', 'published', 'scheduled', 'archived'),
  scheduledAt: Joi.date().iso().optional(),
  createVersion: Joi.boolean().default(true)
});

export const schedulePostSchema = Joi.object({
  scheduledAt: Joi.date().iso().greater('now').required()
});
