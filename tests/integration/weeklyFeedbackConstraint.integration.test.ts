import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';

const databaseUrl = process.env.TEST_DATABASE_URL || '';
const safeDatabase = (() => {
  try {
    const parsed = new URL(databaseUrl);
    return ['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname)
      && /(?:test|release|ci)/i.test(parsed.pathname);
  } catch {
    return false;
  }
})();

const integration = safeDatabase ? describe : describe.skip;

integration('weekly feedback overlap constraint', () => {
  it('ignores soft-deleted rows but rejects overlapping active rows', async () => {
    process.env.DATABASE_URL = databaseUrl;
    const [{ db }, { studentsTable, weeklyFeedback }] = await Promise.all([
      import('../../server/db'),
      import('../../server/schema'),
    ]);
    const studentId = randomUUID();
    const deletedId = randomUUID();
    const activeId = randomUUID();

    try {
      await db.insert(studentsTable).values({ id: studentId, name: 'Constraint Test', grade: 'Test' });
      await db.insert(weeklyFeedback).values({
        id: deletedId,
        studentId,
        weekStarting: '2026-08-23',
        weekEnding: '2026-08-29',
        summary: 'Deleted row',
        strengths: [],
        areasToImprove: [],
        deletedAt: new Date(),
      });
      await db.insert(weeklyFeedback).values({
        id: activeId,
        studentId,
        weekStarting: '2026-08-23',
        weekEnding: '2026-08-29',
        summary: 'Active row',
        strengths: [],
        areasToImprove: [],
      });

      await expect(db.insert(weeklyFeedback).values({
        studentId,
        weekStarting: '2026-08-24',
        weekEnding: '2026-08-30',
        summary: 'Overlapping active row',
        strengths: [],
        areasToImprove: [],
      })).rejects.toBeTruthy();
    } finally {
      await db.delete(weeklyFeedback).where(eq(weeklyFeedback.studentId, studentId));
      await db.delete(studentsTable).where(eq(studentsTable.id, studentId));
    }
  });
});
