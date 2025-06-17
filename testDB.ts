import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
const { Pool } = pg;

import * as schema from './server/schema';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const db = drizzle(pool, { schema });

async function testDb() {
  try {
    console.log('Testing `users` table...');
    const users = await db.select().from(schema.users).limit(5);
    console.log(users);

    console.log('Testing `students` table...');
    const students = await db.select().from(schema.studentsTable).limit(5);
    console.log(students);

    console.log('Testing `daily_progress` table...');
    const progress = await db.select().from(schema.dailyProgress).limit(5);
    console.log(progress);

    console.log('Testing `weekly_feedback` table...');
    const feedback = await db.select().from(schema.weeklyFeedback).limit(5);
    console.log(feedback);

    console.log('✅ All queries executed successfully.');
  } catch (error) {
    console.error('❌ Error during DB test:', error);
  } finally {
    await pool.end();
  }
}

testDb();
