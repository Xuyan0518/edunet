import { neon, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Configure connection settings (important for serverless)
neonConfig.fetchConnectionCache = true; // Enable connection pooling
neonConfig.pipelineConnect = false; // Disable for non-WebSocket environments

// Create Neon client
const sql = neon(process.env.DATABASE_URL!);

// Initialize Drizzle with Neon
export const db = drizzle(sql, { 
  schema,
  logger: process.env.NODE_ENV !== 'production' // Enable logging in dev
});

// Type exports for your database
export type Database = typeof db;