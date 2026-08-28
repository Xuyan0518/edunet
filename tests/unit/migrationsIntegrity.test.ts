import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('SQL migration integrity', () => {
  it('contains no unresolved merge-conflict markers', () => {
    const migrationsDir = resolve(process.cwd(), 'server/migrations');
    const sqlFiles = readdirSync(migrationsDir).filter((file) => file.endsWith('.sql'));
    const conflicts = sqlFiles.flatMap((file) => {
      const content = readFileSync(resolve(migrationsDir, file), 'utf8');
      return /^(<<<<<<<|=======|>>>>>>>)/m.test(content) ? [file] : [];
    });

    expect(conflicts).toEqual([]);
  });
});
