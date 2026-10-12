import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { hashPassword, isPasswordHash, ADMIN_PASSWORD_HASH_PATTERN } from '../server/auth/password';

// This migration never prints identities, passwords, SQL, or connection strings.
// --apply authorizes changes to the explicitly configured DATABASE_URL.
let phase = 'configuration';
async function main() {
  if (!process.env.DATABASE_URL) throw new Error('Missing configuration');
  const sql = neon(process.env.DATABASE_URL);
  phase = 'reading credentials';
  const rows = await sql`SELECT id, password FROM admins WHERE password IS NOT NULL`;
  const legacy = rows.filter(row => !String(row.password).startsWith('scrypt$'));
  phase = 'validating stored hashes';
  if (rows.some(row => String(row.password).startsWith('scrypt$') && !isPasswordHash(String(row.password)))) {
    throw new Error('Malformed hash: repair through a secure password reset before migration');
  }
  if (!process.argv.includes('--apply')) {
    console.log(`Administrator password migration: ${legacy.length} legacy credentials. Run with --apply to hash them and enforce hash-only storage.`);
    return;
  }
  phase = 'hashing credentials';
  const updates = [];
  for (const row of legacy) {
    const hash = await hashPassword(String(row.password));
    updates.push(sql`UPDATE admins SET password=${hash}, updated_at=now() WHERE id=${row.id} AND password=${row.password}`);
  }
  // Expansion, compare-and-swap updates and constraint validation are atomic.
  phase = 'atomic database migration';
  await sql.transaction([
    sql`ALTER TABLE admins ALTER COLUMN password TYPE varchar(128)`,
    ...updates,
    sql`ALTER TABLE admins DROP CONSTRAINT IF EXISTS admins_password_hash_only`,
    sql`ALTER TABLE admins ADD CONSTRAINT admins_password_hash_only CHECK (password IS NULL OR password ~ '^(scrypt[$][a-f0-9]{32}[$][a-f0-9]{64}|scrypt[$]16384[$]8[$]1[$][A-Za-z0-9_-]{22}[$][A-Za-z0-9_-]{43})$')`,
  ]);
  phase = 'verifying migration';
  const remaining = await sql`SELECT count(*)::int AS count FROM admins WHERE password IS NOT NULL AND password !~ ${ADMIN_PASSWORD_HASH_PATTERN}`;
  if (remaining[0].count !== 0) throw new Error('Migration verification failed');
  console.log(`Administrator credentials secured; ${legacy.length} legacy passwords migrated, zero plaintext passwords remain. Hash-only constraint enforced.`);
}

main().catch(error => {
  const code = typeof error?.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code) ? error.code : 'UNKNOWN';
  console.error(`Administrator password migration failed during ${phase} (${code}); credentials and database details are withheld.`);
  process.exitCode = 1;
});
