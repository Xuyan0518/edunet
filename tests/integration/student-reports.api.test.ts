import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Express } from 'express';
import { createMockDb } from '../helpers/mockDb';

const mockDb = createMockDb();

vi.mock('../../server/db', () => ({
  db: mockDb,
}));

vi.mock('../../server/services/actionLocks', () => ({
  withActionLock: async (_options: unknown, callback: () => Promise<unknown>) => callback(),
  isActionLockConflictError: () => false,
  buildActionLockConflictPayload: () => ({ error: 'ACTION_LOCKED' }),
}));

let app: Express;
let generateToken: typeof import('../../server/utils/auth').generateToken;
let fetchMock: ReturnType<typeof vi.fn>;
const STUDENT_ID = '11111111-1111-4111-8111-111111111111';

const makeReportRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'report-1',
  studentId: STUDENT_ID,
  reportType: 'quarterly',
  title: '测试报告',
  startDate: '2026-01-01',
  endDate: '2026-03-31',
  year: 2026,
  summaryText: 'summary text',
  analyticsJson: { overview: { activeDays: 10 } },
  structuredReportJson: { reportType: 'quarterly', subjectReports: [] },
  finalReportJson: { reportType: 'quarterly', subjectReports: [] },
  rawAiResponse: 'raw',
  parseError: null,
  status: 'draft',
  visibleToParent: false,
  createdBy: 'teacher-1',
  updatedBy: 'teacher-1',
  createdAt: new Date('2026-04-01T00:00:00.000Z'),
  updatedAt: new Date('2026-04-01T00:00:00.000Z'),
  updatedByName: 'Teacher A',
  ...overrides,
});

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

describe('student report APIs', () => {
  it('teacher can save report and defaults finalReport + visibleToParent', async () => {
    const token = generateToken({ id: 'teacher-1', role: 'teacher', name: 'Teacher A' });

    mockDb.queueSelect([{ id: 'teacher-1', status: 'approved' }]); // auth
    mockDb.queueSelect([{ id: STUDENT_ID, name: 'Alice', grade: 'G6', parentId: 'parent-1' }]); // student
    mockDb.queueInsert([
      makeReportRow({
        structuredReportJson: { reportType: 'quarterly', subjectReports: [], nextStageRecommendations: [] },
        finalReportJson: { reportType: 'quarterly', subjectReports: [], nextStageRecommendations: [] },
        visibleToParent: false,
      }),
    ]);

    const res = await request(app)
      .post('/api/reports')
      .set('Authorization', `Bearer ${token}`)
      .send({
        studentId: STUDENT_ID,
        reportType: 'quarterly',
        title: 'Q1 学习报告',
        startDate: '2026-01-01',
        endDate: '2026-03-31',
        summary: '本季度总结',
        analytics: { overview: { activeDays: 22 } },
        structuredReport: { executiveSummary: '学习稳定' },
      });

    expect(res.status).toBe(201);
    expect(res.body.visibleToParent).toBe(false);
    expect(res.body.finalReport).toEqual(res.body.structuredReport);
  });

  it('parent cannot create report', async () => {
    const token = generateToken({ id: 'parent-1', role: 'parent', name: 'Parent A' });
    mockDb.queueSelect([{ id: 'parent-1', status: 'approved' }]); // auth

    const res = await request(app)
      .post('/api/reports')
      .set('Authorization', `Bearer ${token}`)
      .send({ studentId: STUDENT_ID, reportType: 'quarterly', startDate: '2026-01-01', endDate: '2026-03-31', summary: 'x' });

    expect(res.status).toBe(403);
  });

  it('teacher can list all student reports', async () => {
    const token = generateToken({ id: 'teacher-1', role: 'teacher', name: 'Teacher A' });
    mockDb.queueSelect([{ id: 'teacher-1', status: 'approved' }]); // auth
    mockDb.queueSelect([{ id: STUDENT_ID, name: 'Alice', grade: 'G6', parentId: 'parent-1' }]); // getStudentById
    mockDb.queueSelect([
      makeReportRow({ id: 'report-1', visibleToParent: false }),
      makeReportRow({ id: 'report-2', visibleToParent: true }),
    ]);

    const res = await request(app)
      .get(`/api/students/${STUDENT_ID}/reports`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(typeof res.body[0].summaryPreview).toBe('string');
  });

  it('parent can list only visible reports for assigned student', async () => {
    const token = generateToken({ id: 'parent-1', role: 'parent', name: 'Parent A' });
    mockDb.queueSelect([{ id: 'parent-1', status: 'approved' }]); // auth
    mockDb.queueSelect([{ id: STUDENT_ID, name: 'Alice', grade: 'G6', parentId: 'parent-1' }]); // verifyParentStudentAccess
    mockDb.queueSelect([{ id: STUDENT_ID, name: 'Alice', grade: 'G6', parentId: 'parent-1' }]); // getStudentById
    mockDb.queueSelect([
      makeReportRow({ id: 'report-2', visibleToParent: true }),
    ]);

    const res = await request(app)
      .get(`/api/students/${STUDENT_ID}/reports`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].visibleToParent).toBe(true);
    expect(res.body[0].rawAiResponse).toBeUndefined();
  });

  it('parent cannot read invisible report detail', async () => {
    const token = generateToken({ id: 'parent-1', role: 'parent', name: 'Parent A' });
    mockDb.queueSelect([{ id: 'parent-1', status: 'approved' }]); // auth
    mockDb.queueSelect([
      {
        ...makeReportRow({ id: 'report-3', visibleToParent: false }),
        studentParentId: 'parent-1',
      },
    ]);

    const res = await request(app)
      .get('/api/reports/report-3')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('teacher can update finalReport and visibleToParent', async () => {
    const token = generateToken({ id: 'teacher-1', role: 'teacher', name: 'Teacher A' });
    mockDb.queueSelect([{ id: 'teacher-1', status: 'approved' }]); // auth
    mockDb.queueSelect([
      {
        ...makeReportRow({ id: 'report-4', visibleToParent: false }),
        studentParentId: 'parent-1',
      },
    ]);
    mockDb.queueUpdate([
      makeReportRow({
        id: 'report-4',
        visibleToParent: true,
        finalReportJson: { reportType: 'quarterly', subjectReports: [{ subjectName: '数学' }] },
      }),
    ]);

    const res = await request(app)
      .patch('/api/reports/report-4')
      .set('Authorization', `Bearer ${token}`)
      .send({
        finalReport: { subjectReports: [{ subjectName: '数学' }] },
        visibleToParent: true,
        status: 'final',
      });

    expect(res.status).toBe(200);
    expect(res.body.visibleToParent).toBe(true);
    expect(res.body.finalReport.subjectReports).toHaveLength(1);
  });

  it('teacher can update report visibility endpoint', async () => {
    const token = generateToken({ id: 'teacher-1', role: 'teacher', name: 'Teacher A' });
    mockDb.queueSelect([{ id: 'teacher-1', status: 'approved' }]); // auth
    mockDb.queueSelect([
      {
        ...makeReportRow({ id: 'report-5', visibleToParent: false }),
        studentParentId: 'parent-1',
      },
    ]); // existing report
    mockDb.queueUpdate([
      makeReportRow({ id: 'report-5', visibleToParent: true }),
    ]);

    const res = await request(app)
      .patch('/api/reports/report-5/visibility')
      .set('Authorization', `Bearer ${token}`)
      .send({ visibleToParent: true });

    expect(res.status).toBe(200);
    expect(res.body.visibleToParent).toBe(true);
  });

  it('teacher can delete report endpoint', async () => {
    const token = generateToken({ id: 'teacher-1', role: 'teacher', name: 'Teacher A' });
    mockDb.queueSelect([{ id: 'teacher-1', status: 'approved' }]); // auth
    mockDb.queueSelect([
      {
        ...makeReportRow({ id: 'report-del-1', visibleToParent: false }),
        studentParentId: 'parent-1',
      },
    ]); // report with student
    mockDb.queueUpdate([{ id: 'report-del-1' }]); // soft delete returning

    const res = await request(app)
      .delete('/api/reports/report-del-1')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: 'Report moved to bin' });
  });
});

describe('AI summary saveReport flow', () => {
  it('quarterly saveReport=true returns reportId and savedReport', async () => {
    const token = generateToken({ id: 'teacher-1', role: 'teacher', name: 'Teacher A' });
    mockDb.queueSelect([{ id: 'teacher-1', status: 'approved' }]); // auth
    mockDb.queueSelect([{ id: STUDENT_ID, name: 'Alice', grade: 'G6', parentId: 'parent-1' }]); // student
    mockDb.queueSelect([]); // daily
    mockDb.queueSelect([]); // weekly
    mockDb.queueSelect([]); // papers
    mockDb.queueSelect([]); // exams
    mockDb.queueSelect([]); // scores
    mockDb.queueSelect([]); // previous quarter
    mockDb.queueInsert([
      makeReportRow({
        id: 'saved-quarterly-1',
        reportType: 'quarterly',
        structuredReportJson: { reportType: 'quarterly', subjectReports: [] },
        finalReportJson: { reportType: 'quarterly', subjectReports: [] },
      }),
    ]);

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                reportType: 'quarterly',
                executiveSummary: '季度总结',
                subjectReports: [],
                nextStageRecommendations: [],
              }),
            },
          },
        ],
      }),
    });

    const res = await request(app)
      .post('/api/ai/quarterly-summary')
      .set('Authorization', `Bearer ${token}`)
      .send({
        studentId: STUDENT_ID,
        startDate: '2026-01-01',
        endDate: '2026-03-31',
        saveReport: true,
      });

    expect(res.status).toBe(200);
    expect(typeof res.body.summary).toBe('string');
    expect(res.body.analytics).toBeTruthy();
    expect(res.body.reportId).toBe('saved-quarterly-1');
    expect(res.body.savedReport).toBeTruthy();
  });

  it('yearly saveReport=true returns reportId and savedReport', async () => {
    const token = generateToken({ id: 'teacher-1', role: 'teacher', name: 'Teacher A' });
    mockDb.queueSelect([{ id: 'teacher-1', status: 'approved' }]); // auth
    mockDb.queueSelect([{ id: STUDENT_ID, name: 'Alice', grade: 'G6', parentId: 'parent-1' }]); // student
    mockDb.queueSelect([]); // daily
    mockDb.queueSelect([]); // weekly
    mockDb.queueSelect([]); // papers
    mockDb.queueSelect([]); // exams
    mockDb.queueSelect([]); // scores
    mockDb.queueSelect([]); // quarter summaries
    mockDb.queueInsert([
      makeReportRow({
        id: 'saved-yearly-1',
        reportType: 'yearly',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        structuredReportJson: { reportType: 'yearly', subjectReports: [] },
        finalReportJson: { reportType: 'yearly', subjectReports: [] },
      }),
    ]);

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                reportType: 'yearly',
                annualExecutiveSummary: '年度总结',
                subjectReports: [],
                nextYearRecommendations: [],
              }),
            },
          },
        ],
      }),
    });

    const res = await request(app)
      .post('/api/ai/yearly-summary')
      .set('Authorization', `Bearer ${token}`)
      .send({
        studentId: STUDENT_ID,
        year: 2026,
        saveReport: true,
      });

    expect(res.status).toBe(200);
    expect(res.body.reportId).toBe('saved-yearly-1');
    expect(res.body.savedReport).toBeTruthy();
  });

  it('quarterly without saveReport keeps old-compatible response and no reportId', async () => {
    const token = generateToken({ id: 'teacher-1', role: 'teacher', name: 'Teacher A' });
    mockDb.queueSelect([{ id: 'teacher-1', status: 'approved' }]); // auth
    mockDb.queueSelect([{ id: STUDENT_ID, name: 'Alice', grade: 'G6', parentId: 'parent-1' }]); // student
    mockDb.queueSelect([]); // daily
    mockDb.queueSelect([]); // weekly
    mockDb.queueSelect([]); // papers
    mockDb.queueSelect([]); // exams
    mockDb.queueSelect([]); // scores
    mockDb.queueSelect([]); // previous quarter

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                reportType: 'quarterly',
                executiveSummary: '季度总结',
                subjectReports: [],
                nextStageRecommendations: [],
              }),
            },
          },
        ],
      }),
    });

    const res = await request(app)
      .post('/api/ai/quarterly-summary')
      .set('Authorization', `Bearer ${token}`)
      .send({ studentId: STUDENT_ID, startDate: '2026-01-01', endDate: '2026-03-31' });

    expect(res.status).toBe(200);
    expect(typeof res.body.summary).toBe('string');
    expect(res.body.structuredReport).toBeTruthy();
    expect(res.body.analytics).toBeTruthy();
    expect(res.body.reportId).toBeUndefined();
  });
});
