import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import dotenv from 'dotenv';
import { migrationConnection } from './utils/migrationConnection';
import { logSafeError } from './utils/safeLog';

dotenv.config();

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  // Legacy multi-statement SQL works over PostgreSQL, not Neon HTTP prepared statements.
  const pool = new pg.Pool({ ...migrationConnection(databaseUrl), connectionTimeoutMillis: 15_000 });
  try {
    const client = await pool.connect();
    try {
      await client.query("SET lock_timeout = '30s'");
      await client.query('SELECT pg_advisory_lock(hashtext($1))', ['edunet:schema-migration']);
      console.log('Migrating database...');
      await migrate(drizzle(client), { migrationsFolder: './server/migrations' });
      console.log('Migration complete');
    } finally {
      await client.query('SELECT pg_advisory_unlock(hashtext($1))', ['edunet:schema-migration']).catch(() => {});
      client.release();
    }
  } finally { await pool.end(); }
}

main().catch((err) => {
  logSafeError('Migration failed', err);
  process.exitCode = 1;
});
