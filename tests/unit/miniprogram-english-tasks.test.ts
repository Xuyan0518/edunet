import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  DEFAULT_ENGLISH_TASKS,
  normalizeEnglishTaskConfig,
  getCanonicalTaskKeys,
} = require('../../miniprogram/utils/englishTasks.js');

describe('miniprogram english task config helpers', () => {
  it('returns defaults when config missing', () => {
    const out = normalizeEnglishTaskConfig(null);
    expect(out).toHaveLength(DEFAULT_ENGLISH_TASKS.length);
    expect(out[0].key).toBe('editing');
  });

  it('normalizes custom task names and fields', () => {
    const out = normalizeEnglishTaskConfig([
      {
        id: 'x1',
        key: 'Listening Drill',
        chineseName: '听力',
        englishName: 'Listening',
        weeklyTargetCount: '8',
        enabledFields: ['practiceCount', 'invalid-field'],
        enabled: true,
      },
    ]);

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: 'x1',
      key: 'listening_drill',
      chineseName: '听力',
      englishName: 'Listening',
      weeklyTargetCount: 8,
      enabledFields: ['practiceCount'],
    });
  });

  it('exposes canonical task keys for old english blocks', () => {
    expect(getCanonicalTaskKeys()).toEqual(['editing', 'reading', 'grammar', 'vocab', 'recitation', 'essay']);
  });
});
