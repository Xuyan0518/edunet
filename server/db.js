import { drizzle } from 'drizzle-orm/node-postgres';
import pkg from 'pg';
import * as schema from './schema.js';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pkg;

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'edunet',
  password: process.env.DB_PASSWORD || 'password',
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 5432,
});

export const db = drizzle(pool, { schema });
