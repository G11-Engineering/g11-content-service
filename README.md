# Content Service

Blog post and content management microservice for the G11 CMS platform.

## Stack

- Node.js 18
- TypeScript
- Express.js
- PostgreSQL
- Scheduled publishing with node-cron
- Slugify for URL generation

## API Endpoints

- `GET /api/posts` - List posts with pagination
- `GET /api/posts/:id` - Get single post
- `POST /api/posts` - Create post
- `PUT /api/posts/:id` - Update post
- `DELETE /api/posts/:id` - Delete post
- `POST /api/posts/:id/publish` - Publish post

## Environment Variables

```env
PORT=3002
DATABASE_URL=postgresql://user:pass@localhost:5432/content
JWT_SECRET=your-secret-key
CATEGORY_SERVICE_URL=http://localhost:3004
MEDIA_SERVICE_URL=http://localhost:3003
```

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm start
```

## Docker

```bash
docker build -t g11-content-service .
docker run -p 3002:3002 g11-content-service
```
