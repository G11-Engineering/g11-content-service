import cron from 'node-cron';
import axios from 'axios';
import { config, getServiceUrl } from '../config/config';

class PostScheduler {
  private isRunning = false;

  constructor() {
    this.start();
  }

  private start() {
    if (this.isRunning) return;
    
    if (!config.scheduler.enabled) {
      console.log('Post scheduler is disabled');
      return;
    }
    
    // Run on configured schedule to check for scheduled posts
    cron.schedule(config.scheduler.cronSchedule, async () => {
      try {
        await this.publishScheduledPosts();
      } catch (error) {
        console.error('Error in post scheduler:', error);
      }
    });

    this.isRunning = true;
    console.log(`Post scheduler started - checking for scheduled posts on schedule: ${config.scheduler.cronSchedule}`);
  }

  private async publishScheduledPosts() {
    try {
      const contentServiceUrl = getServiceUrl('contentService');
      const publishUrl = `${contentServiceUrl}${config.scheduler.publishEndpoint}`;
      const response = await axios.post(publishUrl);
      
      if (response.data.publishedPosts.length > 0) {
        console.log(`Published ${response.data.publishedPosts.length} scheduled posts:`, 
          response.data.publishedPosts.map((p: any) => p.title).join(', '));
      }
    } catch (error) {
      console.error('Failed to publish scheduled posts:', error);
    }
  }

  public stop() {
    this.isRunning = false;
    console.log('Post scheduler stopped');
  }
}

export const postScheduler = new PostScheduler();
