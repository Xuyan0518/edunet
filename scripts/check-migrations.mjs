import { readdir, readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

const migrationsRoot = resolve(process.cwd(), 'server/migrations');
const conflictMarker = /^(<<<<<<<|=======|>>>>>>>)/m;

async function collectSqlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const absolutePath = resolve(directory, entry.name);
    if (entry.isDirectory()) return collectSqlFiles(absolutePath);
    return entry.isFile() && entry.name.endsWith('.sql') ? [absolutePath] : [];
  }));
  return nested.flat();
}

const sqlFiles = await collectSqlFiles(migrationsRoot);
if (sqlFiles.length === 0) {
  throw new Error(`No SQL migrations found under ${migrationsRoot}`);
}

const conflicts = [];
for (const sqlFile of sqlFiles) {
  const content = await readFile(sqlFile, 'utf8');
  if (conflictMarker.test(content)) conflicts.push(sqlFile);
}
if (conflicts.length > 0) {
  throw new Error(`Migration conflict markers found in:\n${conflicts.join('\n')}`);
}

const journal = JSON.parse(await readFile(resolve(migrationsRoot, 'meta/_journal.json'), 'utf8'));
const manual = JSON.parse(await readFile(resolve(migrationsRoot, 'manual-migrations.json'), 'utf8'));
const fileNames = new Set(sqlFiles.map((file) => basename(file)));
const journalFiles = new Set(journal.entries.map((entry) => `${entry.tag}.sql`));
const manualFiles = new Set(manual.files);
const expectedIndexes = journal.entries.map((_, index) => index);
const actualIndexes = journal.entries.map((entry) => entry.idx);

if (JSON.stringify(actualIndexes) !== JSON.stringify(expectedIndexes)) {
  throw new Error('Migration journal indexes are not contiguous and ordered.');
}

const unaccounted = [...fileNames].filter((file) => !journalFiles.has(file) && !manualFiles.has(file));
const missingJournalSql = [...journalFiles].filter((file) => !fileNames.has(file));
const missingManualSql = [...manualFiles].filter((file) => !fileNames.has(file));
if (unaccounted.length || missingJournalSql.length || missingManualSql.length) {
  throw new Error([
    unaccounted.length ? `Unaccounted SQL: ${unaccounted.join(', ')}` : '',
    missingJournalSql.length ? `Journal entries without SQL: ${missingJournalSql.join(', ')}` : '',
    missingManualSql.length ? `Manual entries without SQL: ${missingManualSql.join(', ')}` : '',
  ].filter(Boolean).join('\n'));
}

console.log(`Migration integrity check passed for ${sqlFiles.length} SQL files (${journalFiles.size} journaled, ${manualFiles.size} manual).`);
