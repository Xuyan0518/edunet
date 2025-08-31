import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/edunet',
});

const db = drizzle(pool);

async function runMigration() {
  try {
    console.log('Starting migration: Update progress tables to match new schema...');
    
    // Read the migration file
    const migrationPath = join(__dirname, 'migrations', '0007_update_progress_tables_to_new_schema.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf8');
    
    // Split the SQL into individual statements (basic splitting)
    const statements = migrationSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
    
    console.log(`Found ${statements.length} SQL statements to execute`);
    
    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement.trim()) {
        try {
          console.log(`Executing statement ${i + 1}/${statements.length}...`);
          await pool.query(statement);
          console.log(`✓ Statement ${i + 1} executed successfully`);
        } catch (error) {
          console.error(`✗ Error executing statement ${i + 1}:`, error);
          // Continue with next statement
        }
      }
    }
    
    console.log('Migration completed!');
    
    // Verify the new structure
    console.log('\nVerifying new table structure...');
    
    const dailyProgressStructure = await pool.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'daily_progress' 
      ORDER BY ordinal_position
    `);
    
    const weeklyFeedbackStructure = await pool.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'weekly_feedback' 
      ORDER BY ordinal_position
    `);
    
    console.log('\nDaily Progress table structure:');
    dailyProgressStructure.rows.forEach(row => {
      console.log(`  ${row.column_name}: ${row.data_type} (${row.is_nullable === 'YES' ? 'nullable' : 'not null'})`);
    });
    
    console.log('\nWeekly Feedback table structure:');
    weeklyFeedbackStructure.rows.forEach(row => {
      console.log(`  ${row.column_name}: ${row.data_type} (${row.is_nullable === 'YES' ? 'nullable' : 'not null'})`);
    });
    
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await pool.end();
  }
}

runMigration();
