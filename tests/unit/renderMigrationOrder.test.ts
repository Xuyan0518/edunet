import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Render deployment migration ordering', () => {
  it.each(['render.yaml', 'render.staging.yaml'])('%s runs migrations before starting the API', (manifest) => {
    const content = readFileSync(resolve(process.cwd(), manifest), 'utf8');
    const startCommand = content.match(/^\s*startCommand:\s*(.+)$/m)?.[1]?.trim();

    expect(startCommand).toBe('npm run db:migrate && npm run start:api');
  });
});
