import cron from 'node-cron';
import axios from 'axios';

const CONTENT_SERVICE_URL = process.env.CONTENT_SERVICE_URL || 'http://localhost:3002';

class PostScheduler {
  private isRunning = false;

  constructor() {
    this.start();
  }

  private start() {
    if (this.isRunning) return;
    
    // Run every minute to check for scheduled posts
    cron.schedule('* * * * *', async () => {
      try {
        await this.publishScheduledPosts();
      } catch (error) {
        console.error('Error in post scheduler:', error);
      }
    });

    this.isRunning = true;
    console.log('Post scheduler started - checking for scheduled posts every minute');
  }

  private async publishScheduledPosts() {
    try {
      const response = await axios.post(`${CONTENT_SERVICE_URL}/api/posts/scheduled/publish`);
      
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
