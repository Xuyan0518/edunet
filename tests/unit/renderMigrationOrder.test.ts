import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REQUIRED_PRODUCTION_SETTINGS } from '../../server/utils/productionConfig';

const manifest = (name: string) => readFileSync(resolve(process.cwd(), name), 'utf8');
const field = (content: string, name: string) => content.match(new RegExp(`^\\s*${name}:\\s*(.+)$`, 'm'))?.[1]?.trim();

describe('Render deployment migration ordering', () => {
  it('production uses a paid pre-deploy migration gate and manual promotion', () => {
    const content = manifest('render.yaml');

    expect(field(content, 'plan')).not.toBe('free');
    expect(field(content, 'autoDeployTrigger')).toBe('off');
    expect(field(content, 'preDeployCommand')).toBe('npm run db:migrate');
    expect(field(content, 'startCommand')).toBe('npm run start:api');
  });

  it('free staging retains migration-before-start and manual promotion', () => {
    const content = manifest('render.staging.yaml');

    expect(field(content, 'autoDeployTrigger')).toBe('off');
    expect(field(content, 'startCommand')).toBe('npm run db:migrate && npm run start:api');
    expect(content).toMatch(/- key: DATABASE_SSL_MODE\s+value: ["']?disable["']?/);
  });

  it('declares every fail-closed production setting in Render manifests and the environment example', () => {
    const manifests = [manifest('render.yaml'), manifest('render.staging.yaml'), manifest('.env.render.example')];

    for (const setting of REQUIRED_PRODUCTION_SETTINGS) {
      for (const content of manifests) {
        expect(content, `${setting} is missing`).toContain(setting);
      }
    }
  });
});
