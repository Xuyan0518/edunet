import 'dotenv/config';
import { db } from './db';
import { users, studentsTable, dailyProgress, weeklyFeedback } from './schema';

async function seed() {
  console.log('🌱 Seeding database...');

  // Insert users
  const insertedUsers = await db.insert(users).values([
    {
      name: 'John Teacher',
      email: 'teacher@example.com',
      password: 'password',
      role: 'teacher',
    },
    {
      name: 'Jane Parent',
      email: 'parent@example.com',
      password: 'password',
      role: 'parent',
    },
  ]).returning();

  const parent = insertedUsers.find(u => u.email === 'parent@example.com');
  const parentId = parent?.id ?? 2;

  // Insert students
  const insertedStudents = await db.insert(studentsTable).values([
    {
      name: 'Alice',
      grade: '3rd Grade',
      parentId,
    },
    {
      name: 'Bob',
      grade: '5th Grade',
      parentId,
    },
  ]).returning();

  const aliceId = insertedStudents[0]?.id ?? 1;

  // Insert daily progress
  

  console.log('✅ Seeding complete');
}

seed().then(() => process.exit(0)).catch((err) => {
  console.error('❌ Error seeding:', err);
  process.exit(1);
});
