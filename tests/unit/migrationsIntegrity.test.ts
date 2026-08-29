import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationsDir = resolve(process.cwd(), 'server/migrations');
const sqlFiles = readdirSync(migrationsDir).filter((file) => file.endsWith('.sql'));

describe('SQL migration integrity', () => {
  it('contains no unresolved merge-conflict markers', () => {
    const conflicts = sqlFiles.flatMap((file) => {
      const content = readFileSync(resolve(migrationsDir, file), 'utf8');
      return /^(<<<<<<<|=======|>>>>>>>)/m.test(content) ? [file] : [];
    });

    expect(conflicts).toEqual([]);
  });

  it('accounts for every SQL file in the Drizzle journal or explicit manual-migration manifest', () => {
    const journal = JSON.parse(readFileSync(resolve(migrationsDir, 'meta', '_journal.json'), 'utf8')) as {
      entries: Array<{ idx: number; tag: string }>;
    };
    const manual = JSON.parse(readFileSync(resolve(migrationsDir, 'manual-migrations.json'), 'utf8')) as {
      files: string[];
    };
    const journalFiles = new Set(journal.entries.map((entry) => `${entry.tag}.sql`));
    const manualFiles = new Set(manual.files);

    expect(journal.entries.map((entry) => entry.idx)).toEqual(journal.entries.map((_, index) => index));
    expect(sqlFiles.filter((file) => !journalFiles.has(file) && !manualFiles.has(file))).toEqual([]);
    expect(manual.files.filter((file) => !sqlFiles.includes(file))).toEqual([]);
  });

  it('rebuilds the weekly period expression so partially applied legacy schemas converge', () => {
    const migration = readFileSync(
      resolve(migrationsDir, '0038_add_weekly_feedback_constraints.sql'),
      'utf8',
    );

    expect(migration).toContain('DROP CONSTRAINT IF EXISTS ex_weekly_feedback_no_overlap');
    expect(migration).toContain('DROP COLUMN IF EXISTS period');
    expect(migration).toContain("daterange(week_starting, week_ending, '[]')");
    expect(migration).toContain('WHERE (deleted_at IS NULL)');
  });
});
