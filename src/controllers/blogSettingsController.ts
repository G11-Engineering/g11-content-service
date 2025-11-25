import { Request, Response, NextFunction } from 'express';
import { getDatabase } from '../config/database';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';

const SETTINGS_ID = '00000000-0000-0000-0000-000000000001';

export const getBlogSettings = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const db = getDatabase();
    
    const result = await db.query(
      `SELECT blog_title, blog_description, blog_logo_url, blog_favicon_url, 
              contact_email, social_facebook, social_twitter, social_linkedin, social_github,
              seo_meta_title, seo_meta_description, seo_keywords, google_analytics_id,
              updated_at, updated_by 
       FROM blog_settings WHERE id = $1`,
      [SETTINGS_ID]
    );

    if (result.rows.length === 0) {
      // Create default settings if they don't exist
      await db.query(`
        INSERT INTO blog_settings (id, blog_title, blog_description)
        VALUES ($1, $2, $3)
      `, [SETTINGS_ID, 'My Blog', 'Welcome to my blog']);
      
      const newResult = await db.query(
        `SELECT blog_title, blog_description, blog_logo_url, blog_favicon_url, 
                contact_email, social_facebook, social_twitter, social_linkedin, social_github,
                seo_meta_title, seo_meta_description, seo_keywords, google_analytics_id,
                updated_at, updated_by 
         FROM blog_settings WHERE id = $1`,
        [SETTINGS_ID]
      );
      
      res.json({ settings: newResult.rows[0] });
      return;
    }

    res.json({ settings: result.rows[0] });
  } catch (error) {
    console.error('Error fetching blog settings:', error);
    next(error);
  }
};

export const updateBlogSettings = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { 
      blogTitle, 
      blogDescription, 
      blogLogoUrl, 
      blogFaviconUrl,
      contactEmail,
      socialFacebook,
      socialTwitter,
      socialLinkedin,
      socialGithub,
      seoMetaTitle,
      seoMetaDescription,
      seoKeywords,
      googleAnalyticsId
    } = req.body;
    const db = getDatabase();

    // Validate required fields
    if (!blogTitle || blogTitle.trim().length === 0) {
      throw createError('Blog title is required', 400);
    }

    if (blogTitle.length > 200) {
      throw createError('Blog title must be 200 characters or less', 400);
    }

    // Update or insert settings
    const result = await db.query(`
      INSERT INTO blog_settings (
        id, blog_title, blog_description, blog_logo_url, blog_favicon_url,
        contact_email, social_facebook, social_twitter, social_linkedin, social_github,
        seo_meta_title, seo_meta_description, seo_keywords, google_analytics_id, updated_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      ON CONFLICT (id) 
      DO UPDATE SET 
        blog_title = EXCLUDED.blog_title,
        blog_description = EXCLUDED.blog_description,
        blog_logo_url = EXCLUDED.blog_logo_url,
        blog_favicon_url = EXCLUDED.blog_favicon_url,
        contact_email = EXCLUDED.contact_email,
        social_facebook = EXCLUDED.social_facebook,
        social_twitter = EXCLUDED.social_twitter,
        social_linkedin = EXCLUDED.social_linkedin,
        social_github = EXCLUDED.social_github,
        seo_meta_title = EXCLUDED.seo_meta_title,
        seo_meta_description = EXCLUDED.seo_meta_description,
        seo_keywords = EXCLUDED.seo_keywords,
        google_analytics_id = EXCLUDED.google_analytics_id,
        updated_by = EXCLUDED.updated_by,
        updated_at = CURRENT_TIMESTAMP
      RETURNING blog_title, blog_description, blog_logo_url, blog_favicon_url,
                contact_email, social_facebook, social_twitter, social_linkedin, social_github,
                seo_meta_title, seo_meta_description, seo_keywords, google_analytics_id,
                updated_at, updated_by
    `, [
      SETTINGS_ID,
      blogTitle.trim(),
      blogDescription ? blogDescription.trim() : null,
      blogLogoUrl ? blogLogoUrl.trim() : null,
      blogFaviconUrl ? blogFaviconUrl.trim() : null,
      contactEmail ? contactEmail.trim() : null,
      socialFacebook ? socialFacebook.trim() : null,
      socialTwitter ? socialTwitter.trim() : null,
      socialLinkedin ? socialLinkedin.trim() : null,
      socialGithub ? socialGithub.trim() : null,
      seoMetaTitle ? seoMetaTitle.trim() : null,
      seoMetaDescription ? seoMetaDescription.trim() : null,
      seoKeywords ? seoKeywords.trim() : null,
      googleAnalyticsId ? googleAnalyticsId.trim() : null,
      req.user?.id || null
    ]);

    res.json({
      settings: result.rows[0],
      message: 'Blog settings updated successfully'
    });
  } catch (error) {
    console.error('Error updating blog settings:', error);
    next(error);
  }
};

