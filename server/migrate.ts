import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import { drizzle as drizzleNeonHttp } from 'drizzle-orm/neon-http';
import { migrate as migrateNeonHttp } from 'drizzle-orm/neon-http/migrator';
import pg from 'pg';
import dotenv from 'dotenv';
import { neon, neonConfig } from '@neondatabase/serverless';

dotenv.config();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('Migration failed: missing DATABASE_URL');
  process.exit(1);
}

const shouldUseNeonHttp =
  process.env.DB_MIGRATE_DRIVER === 'neon-http' ||
  /neon\.tech/i.test(databaseUrl);

let pool: pg.Pool | null = null;

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
  if (shouldUseNeonHttp) {
    // Neon HTTP migration uses HTTPS (443), which is often reachable even when
    // raw Postgres TCP (5432) is blocked on local networks.
    neonConfig.fetchConnectionCache = true;
    const sqlClient = neon(databaseUrl);
    const db = drizzleNeonHttp(sqlClient);
    await migrateNeonHttp(db, {
      migrationsFolder: './server/migrations',
    });
  } else {
    pool = new pg.Pool({
      connectionString: databaseUrl,
      ssl: {
        rejectUnauthorized: false,
      },
    });
    const db = drizzlePg(pool);
    await migratePg(db, {
      migrationsFolder: './server/migrations',
    });
  }
  console.log('Migration complete');
  if (pool) await pool.end();
  process.exit(0);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
