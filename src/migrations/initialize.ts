import { getDatabase } from '../config/database';
import fs from 'fs';
import path from 'path';

export const initializeDatabase = async (): Promise<void> => {
  try {
    const db = getDatabase();
    
    // Read and execute the schema
    const schemaPath = path.join(__dirname, '../../../../database/schemas/content-service.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    try {
      await db.query(schema);
      console.log('Content service database schema initialized');
    } catch (error: any) {
      // If schema already exists, that's fine
      if (error.code === '42P07' || error.code === '42710' || error.message.includes('already exists')) {
        console.log('Content service database schema already initialized');
      } else {
        throw error;
      }
    }
    
  } catch (error) {
    console.error('Database initialization failed:', error);
    throw error;
  }
};
