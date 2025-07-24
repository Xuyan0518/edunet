import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await pool.query('TRUNCATE TABLE drizzle_migrations;');
    console.log('Successfully truncated drizzle_migrations table.');
  } catch (err) {
    console.error('Failed to truncate drizzle_migrations:', err);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

main();
