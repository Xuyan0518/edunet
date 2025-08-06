import { db } from './db.ts';
import { adminsTable } from './schema.ts';

async function insertAdmin() {
  await db.insert(adminsTable).values({
    name: 'Zhou Xuyan',
    email: 'admin@mail.com',
    password: 'admin',
  });
  console.log('Admin inserted!');
  process.exit(0);
}

insertAdmin();