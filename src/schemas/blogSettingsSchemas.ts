import Joi from 'joi';

export const updateBlogSettingsSchema = Joi.object({
  blogTitle: Joi.string().min(1).max(200).required(),
  blogDescription: Joi.string().max(1000).allow('').optional(),
  blogLogoUrl: Joi.string().uri().allow('').optional(),
  blogFaviconUrl: Joi.string().uri().allow('').optional(),
  contactEmail: Joi.string().email().allow('').optional(),
  socialFacebook: Joi.string().uri().allow('').optional(),
  socialTwitter: Joi.string().uri().allow('').optional(),
  socialLinkedin: Joi.string().uri().allow('').optional(),
  socialGithub: Joi.string().uri().allow('').optional(),
  seoMetaTitle: Joi.string().max(200).allow('').optional(),
  seoMetaDescription: Joi.string().max(500).allow('').optional(),
  seoKeywords: Joi.string().max(500).allow('').optional(),
  googleAnalyticsId: Joi.string().max(100).allow('').optional(),
});

