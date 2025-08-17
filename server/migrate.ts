import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import dotenv from 'dotenv';
import { sql } from 'drizzle-orm'; // import sql helper

dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

const db = drizzle(pool);

async function main() {
  // console.log('Dropping existing tables if any...');
  // await db.execute(sql`
  //   DROP TABLE IF EXISTS
  //     "daily_progress",
  //     "weekly_feedback",
  //     "students",
  //     "parents",
  //     "teacher",
  //     "users",
  //     "admins"
  //   CASCADE;
  // `);

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
