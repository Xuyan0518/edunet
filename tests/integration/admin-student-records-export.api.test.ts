import type { Express } from 'express';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockDb } from '../helpers/mockDb';

const mockDb = createMockDb();

vi.mock('../../server/db', () => ({ db: mockDb }));

let app: Express;
let generateToken: typeof import('../../server/utils/auth').generateToken;

beforeAll(async () => {
  ({ app } = await import('../../server/index'));
  ({ generateToken } = await import('../../server/utils/auth'));
});

beforeEach(() => mockDb.reset());

describe('admin student records spreadsheet export', () => {
  it('returns an authorized XLSX export for all students in the requested range', async () => {
    const token = generateToken({ id: 'admin-1', role: 'admin', name: 'Admin' });
    mockDb.queueSelect([{ id: 'admin-1' }]);
    mockDb.queueSelect([
      { id: 'student-1', name: 'Alice', grade: 'Grade 5' },
      { id: 'student-2', name: 'Bob', grade: 'Grade 6' },
    ]);
    mockDb.queueSelect([
      { studentId: 'student-1', date: '2026-08-04', attendance: 'present', activities: [], summary: 'Alice daily' },
      { studentId: 'student-2', date: '2026-08-05', attendance: 'present', activities: [], summary: 'Bob daily' },
    ]);
    mockDb.queueSelect([]);
    mockDb.queueSelect([]);
    mockDb.queueSelect([
      { studentId: 'student-1', date: '2026-08-06', subjectName: 'Mathematics', description: 'Practice paper', score: 18, total: 20 },
    ]);
    mockDb.queueSelect([
      { id: 'exam-1', studentId: 'student-1', name: 'WA3', examDate: '2026-08-07', examType: 'WA3' },
    ]);
    mockDb.queueSelect([
      { examId: 'exam-1', name: 'English', score: '85/100' },
    ]);

    const response = await request(app)
      .get('/api/admin/student-records-export?studentId=all&startDate=2026-08-03&endDate=2026-08-09')
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(response.headers['content-disposition']).toContain('.xlsx');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(Buffer.isBuffer(response.body)).toBe(true);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(response.body);
    const values = JSON.stringify(workbook.getWorksheet('Weekly Records')!.getSheetValues());
    expect(values).toContain('Alice');
    expect(values).toContain('Bob');
    const weeklyValues = JSON.stringify(workbook.getWorksheet('Weekly Feedback')!.getSheetValues());
    expect(weeklyValues).toContain('Practice paper');
    expect(weeklyValues).toContain('WA3');
    expect(weeklyValues).toContain('85/100');
  });
});
