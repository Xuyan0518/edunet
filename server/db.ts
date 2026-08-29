import { neon, neonConfig } from '@neondatabase/serverless';
import { drizzle as drizzleNeon, type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { drizzle as drizzlePg, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { BatchItem } from 'drizzle-orm/batch';
import pg from 'pg';
import * as schema from './schema.ts';
import { databaseSslConfig, databaseSslRejectUnauthorized } from './utils/databaseSsl.ts';
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
    ssl: databaseSslConfig(
      databaseUrl,
      databaseSslRejectUnauthorized(process.env.DATABASE_SSL_REJECT_UNAUTHORIZED),
      process.env.DATABASE_SSL_MODE,
    ),
  });
  database = drizzlePg(pool, { schema, logger }) as unknown as NeonHttpDatabase<typeof schema>;
}

export const db = database;
export type Database = typeof db;

type AtomicQueryBatch = readonly [BatchItem<'pg'>, ...BatchItem<'pg'>[]];

export const executeAtomicBatch = async (
  buildQueries: (executor: Database) => AtomicQueryBatch,
): Promise<unknown[]> => {
  if (driver === 'neon-http') {
    return [...await database.batch(buildQueries(database))];
  }

  const nodeDatabase = database as unknown as NodePgDatabase<typeof schema>;
  return nodeDatabase.transaction(async (transaction) => {
    const queries = buildQueries(transaction as unknown as Database);
    const results: unknown[] = [];
    for (const query of queries) {
      results.push(await query);
    }
    return results;
  });
};
