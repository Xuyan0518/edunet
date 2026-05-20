import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { makeDailyProgressDraftKey, buildDailyProgressDraftPayload } = require('../../miniprogram/utils/dailyProgressDraft.js');

describe('daily progress draft helpers', () => {
  it('builds stable key by student + date + user', () => {
    const key = makeDailyProgressDraftKey({
      studentId: 's-1',
      date: '2026-05-20',
      userId: 't-1',
    });
    expect(key).toBe('dailyProgressDraft:s-1:2026-05-20:t-1');
  });

  it('falls back to anonymous user key', () => {
    const key = makeDailyProgressDraftKey({
      studentId: 's-2',
      date: '2026-05-21',
    });
    expect(key).toBe('dailyProgressDraft:s-2:2026-05-21:anonymous');
  });

  it('builds payload with metadata and form data', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-20T10:00:00.000Z'));
    const payload = buildDailyProgressDraftPayload({
      studentId: 's-1',
      date: '2026-05-20',
      userId: 't-1',
      formData: {
        attendance: 'present',
        summary: 'hello',
      },
    });
    expect(payload).toMatchObject({
      version: 1,
      studentId: 's-1',
      date: '2026-05-20',
      userId: 't-1',
      attendance: 'present',
      summary: 'hello',
    });
    expect(payload.updatedAt).toBe('2026-05-20T10:00:00.000Z');
    vi.useRealTimers();
  });
});
