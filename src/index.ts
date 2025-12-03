import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { postRoutes } from './routes/posts';
import { blogSettingsRoutes } from './routes/blogSettings';
import { errorHandler } from './middleware/errorHandler';
import { connectDatabase } from './config/database';
import { initializeDatabase } from './migrations/initialize';
import { postScheduler } from './services/scheduler';
import { config, getServiceUrl } from './config/config';

const app = express();
const PORT = config.server.port;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: config.frontend.allowedOrigins,
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  message: config.rateLimit.message
});
app.use(limiter);

// Body parsing
app.use(express.json({ limit: config.request.bodySizeLimit }));
app.use(express.urlencoded({ extended: config.request.urlencodedExtended }));

// Health check
app.get(config.health.endpoint, (req, res) => {
  res.json({ status: 'OK', service: 'content-service', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/posts', postRoutes);
app.use('/api/blog-settings', blogSettingsRoutes);

// Error handling
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Initialize database and start server
async function startServer() {
  try {
    await connectDatabase();
    await initializeDatabase();
    
    app.listen(PORT, config.server.host, () => {
      console.log(`Content Service running on ${config.server.host}:${PORT}`);
      if (config.health.showUrlInLogs) {
        const healthUrl = `${getServiceUrl('contentService')}${config.health.endpoint}`;
        console.log(`Health check: ${healthUrl}`);
      }
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
