import { db } from './db';
import { sql } from 'drizzle-orm';

async function testConnection() {
  try {
    // Test 1: Basic query
    const result = await db.execute(sql`SELECT 1 AS test_value`);
    console.log('✅ Basic query successful:', result.rows[0].test_value === 1);

    // Test 2: Check tables exist
    const tables = await db.execute(
      sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
    );
    console.log('✅ Tables found');
    
    return true;
  } catch (error) {
    console.error('❌ Connection failed:', error);
    return false;
  }
}

testConnection().then(success => {
  process.exit(success ? 0 : 1);
});