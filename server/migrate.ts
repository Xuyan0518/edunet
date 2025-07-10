// server/migrate.ts
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';  // Changed from named import to default import
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({  // Now accessing Pool via pg.Pool
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false  // Important for Neon's SSL
  }
});

const db = drizzle(pool);

async function main() {
  console.log('Migrating database...');
  await migrate(db, { 
    migrationsFolder: './server/migrations' 
  });
  console.log('Migration complete');
  await pool.end();
  process.exit(0);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});