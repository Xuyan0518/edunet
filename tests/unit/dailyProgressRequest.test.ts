import { describe, expect, it } from 'vitest';
import { DailyProgressRequestSchema } from '../../server/schema';

const validBody = {
  studentId: '00000000-0000-0000-0000-000000000001',
  date: '2026-05-01',
  attendance: 'present' as const,
  attendanceStart: '18:00',
  attendanceEnd: '21:00',
  summary: 'OK day',
  activities: [
    {
      subjectName: '英文',
      type: 'english',
      english: { editing: 'free text' },
    },
  ],
};

describe('DailyProgressRequestSchema', () => {
  it('accepts a minimal valid body', () => {
    const result = DailyProgressRequestSchema.safeParse(validBody);
    expect(result.success).toBe(true);
  });

  it('rejects when studentId is not a UUID', () => {
    const r = DailyProgressRequestSchema.safeParse({ ...validBody, studentId: 'not-a-uuid' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.flatten().fieldErrors.studentId).toContain('studentId must be a UUID');
    }
  });

  it('rejects when date is not YYYY-MM-DD', () => {
    const r = DailyProgressRequestSchema.safeParse({ ...validBody, date: '5/1/2026' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.flatten().fieldErrors.date).toContain('date must be YYYY-MM-DD');
    }
  });

  it('rejects when attendance is not in the enum', () => {
    const r = DailyProgressRequestSchema.safeParse({ ...validBody, attendance: 'maybe' });
    expect(r.success).toBe(false);
    if (!r.success) {
      const flat = r.error.flatten().fieldErrors.attendance ?? [];
      expect(flat.length).toBeGreaterThan(0);
    }
  });

  it('rejects when activities array is empty', () => {
    const r = DailyProgressRequestSchema.safeParse({ ...validBody, activities: [] });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.flatten().fieldErrors.activities).toContain('At least one activity is required');
    }
  });

  it('rejects when activities is not an array', () => {
    const r = DailyProgressRequestSchema.safeParse({ ...validBody, activities: 'oops' });
    expect(r.success).toBe(false);
  });

  it('rejects when attendance times are not HH:mm', () => {
    const r = DailyProgressRequestSchema.safeParse({ ...validBody, attendanceStart: '6pm' });
    expect(r.success).toBe(false);
  });

  it('accepts null attendance times (legacy clients)', () => {
    const r = DailyProgressRequestSchema.safeParse({
      ...validBody,
      attendanceStart: null,
      attendanceEnd: null,
      summary: null,
    });
    expect(r.success).toBe(true);
  });

  it('accepts a body with V2 english activity', () => {
    const r = DailyProgressRequestSchema.safeParse({
      ...validBody,
      activities: [
        {
          subjectName: '英文',
          type: 'english',
          english: {
            editing: { text: 'a', score: 7, totalScore: 10, exerciseCount: 5, lossPointIds: ['lp1'], lossPointLabelsSnapshot: ['x'], otherLossPointText: '' },
            reading: { text: 'b', score: null, totalScore: 10, articleCount: 0, lossPointIds: [], lossPointLabelsSnapshot: [], otherLossPointText: '' },
            grammar: { text: 'c', score: null, totalScore: 10, exerciseCount: 0, lossPointIds: [], lossPointLabelsSnapshot: [], otherLossPointText: '' },
            vocab: { text: 'd', vocabularySentenceCount: 0 },
            recitation: { text: 'e' },
            essay: { text: 'f', title: 't', completed: false, score: null, totalScore: null, lossPointIds: [], lossPointLabelsSnapshot: [], otherLossPointText: '' },
          },
        },
      ],
    });
    expect(r.success).toBe(true);
  });

  it('preserves legacy {subject, description, performance, notes} activities', () => {
    const r = DailyProgressRequestSchema.safeParse({
      ...validBody,
      activities: [
        { subject: 'Math', description: 'p', performance: 'good', notes: 'n' },
      ],
    });
    expect(r.success).toBe(true);
  });
});
