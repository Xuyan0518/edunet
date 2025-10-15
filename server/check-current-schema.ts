import { neon, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema.ts';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Configure connection settings
neonConfig.fetchConnectionCache = true;
neonConfig.pipelineConnect = false;

// Create Neon client
const sql = neon(process.env.DATABASE_URL!);

// Initialize Drizzle with Neon
const db = drizzle(sql, { schema });

async function checkCurrentSchema() {
  try {
    console.log('Checking current database schema...\n');
    
    // Check daily_progress table structure using Drizzle
    console.log('=== DAILY_PROGRESS TABLE ===');
    try {
      const dailyProgressSample = await db.select().from(schema.dailyProgress).limit(1);
      if (dailyProgressSample.length > 0) {
        console.log('Daily Progress sample:', JSON.stringify(dailyProgressSample[0], null, 2));
        console.log('Available fields:', Object.keys(dailyProgressSample[0]));
      } else {
        console.log('No daily progress data found');
      }
    } catch (error) {
      console.log('Error accessing daily_progress table:', error);
    }
    
    // Check weekly_feedback table structure using Drizzle
    console.log('\n=== WEEKLY_FEEDBACK TABLE ===');
    try {
      const weeklyFeedbackSample = await db.select().from(schema.weeklyFeedback).limit(1);
      if (weeklyFeedbackSample.length > 0) {
        console.log('Weekly Feedback sample:', JSON.stringify(weeklyFeedbackSample[0], null, 2));
        console.log('Available fields:', Object.keys(weeklyFeedbackSample[0]));
      } else {
        console.log('No weekly feedback data found');
      }
    } catch (error) {
      console.log('Error accessing weekly_feedback table:', error);
    }
    
    // Check schema definitions
    console.log('\n=== SCHEMA DEFINITIONS ===');
    console.log('Daily Progress schema fields:', Object.keys(schema.dailyProgress));
    console.log('Weekly Feedback schema fields:', Object.keys(schema.weeklyFeedback));
    
  } catch (error) {
    console.error('Error checking schema:', error);
  }
}

checkCurrentSchema();
