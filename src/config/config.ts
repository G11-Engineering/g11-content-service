import dotenv from 'dotenv';

dotenv.config();

/**
 * Centralized configuration for the content service
 * All hardcoded values should be moved here and made configurable via environment variables
 */

// Server Configuration
export const serverConfig = {
  port: parseInt(process.env.PORT || '3002', 10),
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',
  apiPrefix: process.env.API_PREFIX || '/api',
};

// Frontend Configuration
export const frontendConfig = {
  url: process.env.FRONTEND_URL || 'http://localhost:3000',
  allowedOrigins: process.env.ALLOWED_ORIGINS 
    ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
    : ['http://localhost:3000'],
};

// Service URLs Configuration
export const serviceConfig = {
  contentService: {
    url: process.env.CONTENT_SERVICE_URL || `http://localhost:${serverConfig.port}`,
    protocol: process.env.CONTENT_SERVICE_PROTOCOL || 'http',
    host: process.env.CONTENT_SERVICE_HOST || 'localhost',
    port: parseInt(process.env.CONTENT_SERVICE_PORT || String(serverConfig.port), 10),
  },
  categoryService: {
    url: process.env.CATEGORY_SERVICE_URL || 'http://category-service:3004',
    protocol: process.env.CATEGORY_SERVICE_PROTOCOL || 'http',
    host: process.env.CATEGORY_SERVICE_HOST || 'category-service',
    port: parseInt(process.env.CATEGORY_SERVICE_PORT || '3004', 10),
    timeout: parseInt(process.env.CATEGORY_SERVICE_TIMEOUT || '5000', 10),
  },
  // Add more services as needed
  tagService: {
    url: process.env.TAG_SERVICE_URL || process.env.CATEGORY_SERVICE_URL || 'http://category-service:3004',
    protocol: process.env.TAG_SERVICE_PROTOCOL || process.env.CATEGORY_SERVICE_PROTOCOL || 'http',
    host: process.env.TAG_SERVICE_HOST || process.env.CATEGORY_SERVICE_HOST || 'category-service',
    port: parseInt(process.env.TAG_SERVICE_PORT || process.env.CATEGORY_SERVICE_PORT || '3004', 10),
    timeout: parseInt(process.env.TAG_SERVICE_TIMEOUT || process.env.CATEGORY_SERVICE_TIMEOUT || '5000', 10),
  },
};

// Database Configuration
export const databaseConfig = {
  url: process.env.DATABASE_URL || '',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  name: process.env.DB_NAME || 'blog_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  ssl: process.env.DB_SSL === 'true' || process.env.NODE_ENV === 'production',
  maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '20', 10),
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT_MS || '30000', 10),
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT_MS || '2000', 10),
};

// Authentication & Security Configuration
export const authConfig = {
  jwtSecret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
  defaultUserId: process.env.DEFAULT_USER_ID || '00000000-0000-0000-0000-000000000001',
};

// Rate Limiting Configuration
export const rateLimitConfig = {
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes default
  max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  message: process.env.RATE_LIMIT_MESSAGE || 'Too many requests from this IP, please try again later.',
};

// Request Configuration
export const requestConfig = {
  bodySizeLimit: process.env.BODY_SIZE_LIMIT || '10mb',
  urlencodedExtended: process.env.URLENCODED_EXTENDED !== 'false',
};

// Scheduler Configuration
export const schedulerConfig = {
  enabled: process.env.SCHEDULER_ENABLED !== 'false',
  cronSchedule: process.env.SCHEDULER_CRON_SCHEDULE || '* * * * *', // Every minute
  publishEndpoint: process.env.SCHEDULER_PUBLISH_ENDPOINT || '/api/posts/scheduled/publish',
};

// Health Check Configuration
export const healthConfig = {
  endpoint: process.env.HEALTH_ENDPOINT || '/health',
  showUrlInLogs: process.env.HEALTH_SHOW_URL_IN_LOGS !== 'false',
};

// Helper function to build service URL from components
export const buildServiceUrl = (service: {
  protocol?: string;
  host: string;
  port: number;
  path?: string;
}): string => {
  const protocol = service.protocol || 'http';
  const path = service.path ? (service.path.startsWith('/') ? service.path : `/${service.path}`) : '';
  return `${protocol}://${service.host}:${service.port}${path}`;
};

// Helper function to get full service URL
// Uses explicit URL if provided via env var, otherwise builds from components
// This allows flexibility: set full URL OR set individual host/port/protocol
export const getServiceUrl = (serviceName: 'contentService' | 'categoryService' | 'tagService'): string => {
  const service = serviceConfig[serviceName];
  
  // Check if explicit URL env var was set
  const envVarName = `${serviceName.toUpperCase().replace('SERVICE', '_SERVICE')}_URL`;
  const explicitEnvUrl = process.env[envVarName];
  
  // If explicit URL was provided via env var, use it
  if (explicitEnvUrl) {
    return explicitEnvUrl;
  }
  
  // Check if any individual component was customized (different from default)
  // If so, build from components to respect the customization
  const protocolEnv = process.env[`${serviceName.toUpperCase().replace('SERVICE', '_SERVICE')}_PROTOCOL`];
  const hostEnv = process.env[`${serviceName.toUpperCase().replace('SERVICE', '_SERVICE')}_HOST`];
  const portEnv = process.env[`${serviceName.toUpperCase().replace('SERVICE', '_SERVICE')}_PORT`];
  
  // If any component was customized, build from components
  if (protocolEnv || hostEnv || portEnv) {
    return buildServiceUrl({
      protocol: service.protocol,
      host: service.host,
      port: service.port,
    });
  }
  
  // Otherwise, use the default URL from config
  return service.url;
};

// Export all config as a single object for convenience
export const config = {
  server: serverConfig,
  frontend: frontendConfig,
  services: serviceConfig,
  database: databaseConfig,
  auth: authConfig,
  rateLimit: rateLimitConfig,
  request: requestConfig,
  scheduler: schedulerConfig,
  health: healthConfig,
};

export default config;

