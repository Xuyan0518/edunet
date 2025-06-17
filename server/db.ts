import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg'; // ✅ default import for CommonJS compatibility
import * as schema from './schema';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'mydb',
  password: process.env.DB_PASSWORD || 'password',
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 5432,
});

export const db = drizzle(pool, { schema });
