import { neon, neonConfig } from '@neondatabase/serverless';
import { drizzle as drizzleNeon, type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.ts';
import dotenv from 'dotenv';
import { selectDatabaseDriver } from './utils/databaseDriver';

dotenv.config();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('Missing DATABASE_URL');
}

const logger = process.env.NODE_ENV !== 'production';
const driver = selectDatabaseDriver(databaseUrl);

let database: NeonHttpDatabase<typeof schema>;

if (driver === 'neon-http') {
  neonConfig.pipelineConnect = false;
  database = drizzleNeon(neon(databaseUrl), { schema, logger });
} else {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });
  database = drizzlePg(pool, { schema, logger }) as unknown as NeonHttpDatabase<typeof schema>;
}

export const db = database;
export type Database = typeof db;
