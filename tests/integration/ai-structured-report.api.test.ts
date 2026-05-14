import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Express } from 'express';
import { createMockDb } from '../helpers/mockDb';

const mockDb = createMockDb();

vi.mock('../../server/db', () => ({
  db: mockDb,
}));

let app: Express;
let generateToken: typeof import('../../server/utils/auth').generateToken;
let fetchMock: ReturnType<typeof vi.fn>;

beforeAll(async () => {
  process.env.DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || 'test-deepseek-key';
  process.env.DEEPSEEK_API_URL = process.env.DEEPSEEK_API_URL || 'https://deepseek.mock/api';

  ({ app } = await import('../../server/index'));
  ({ generateToken } = await import('../../server/utils/auth'));
});

beforeEach(() => {
  mockDb.reset();
  vi.restoreAllMocks();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
});

describe('AI structured quarterly/yearly summary APIs', () => {
  it('quarterly response contains summary, structuredReport and analytics', async () => {
    const token = generateToken({ id: 'teacher-1', role: 'teacher', name: 'Teacher A' });

    mockDb.queueSelect([{ id: 'teacher-1', status: 'approved' }]); // auth verify
    mockDb.queueSelect([{ id: 'stu-1', name: 'Alice', grade: 'G6' }]); // student
    mockDb.queueSelect([]); // daily
    mockDb.queueSelect([]); // weekly
    mockDb.queueSelect([]); // papers
    mockDb.queueSelect([]); // exams
    mockDb.queueSelect([]); // previous quarter

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                reportType: 'quarterly',
                executiveSummary: '本季度学习投入较为稳定。',
                keyHighlights: ['学习活跃率较高'],
                keyConcerns: ['成绩样本偏少'],
                subjectReports: [],
                nextStageRecommendations: [],
                teacherComment: '建议保持学习节奏。',
              }),
            },
          },
        ],
      }),
    });

    const res = await request(app)
      .post('/api/ai/quarterly-summary')
      .set('Authorization', `Bearer ${token}`)
      .send({ studentId: 'stu-1', startDate: '2026-01-01', endDate: '2026-03-31' });

    expect(res.status).toBe(200);
    expect(typeof res.body.summary).toBe('string');
    expect(res.body.structuredReport).toBeTruthy();
    expect(res.body.structuredReport.reportType).toBe('quarterly');
    expect(res.body.analytics).toBeTruthy();
    expect(res.body.rawAiResponse).toBeTypeOf('string');
    expect(res.body).toHaveProperty('parseError');
  });

  it('yearly response keeps summary string even when AI returns plain text', async () => {
    const token = generateToken({ id: 'teacher-2', role: 'teacher', name: 'Teacher B' });

    mockDb.queueSelect([{ id: 'teacher-2', status: 'approved' }]); // auth verify
    mockDb.queueSelect([{ id: 'stu-2', name: 'Bob', grade: 'G7' }]); // student
    mockDb.queueSelect([]); // daily
    mockDb.queueSelect([]); // weekly
    mockDb.queueSelect([]); // papers
    mockDb.queueSelect([]); // exams
    mockDb.queueSelect([]); // quarterly summaries

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: '年度数据较少，当前数据不足以判断长期趋势。',
            },
          },
        ],
      }),
    });

    const res = await request(app)
      .post('/api/ai/yearly-summary')
      .set('Authorization', `Bearer ${token}`)
      .send({ studentId: 'stu-2', year: 2026 });

    expect(res.status).toBe(200);
    expect(typeof res.body.summary).toBe('string');
    expect(res.body.summary).toContain('数据');
    expect(res.body.structuredReport).toBeNull();
    expect(res.body.analytics).toBeTruthy();
    expect(res.body.rawAiResponse).toContain('长期趋势');
    expect(typeof res.body.parseError).toBe('string');
  });
});
