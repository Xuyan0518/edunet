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

const STUDENT_ID = '11111111-1111-4111-8111-111111111111';
const PARENT_ID = '22222222-2222-4222-8222-222222222222';
const TEACHER_ID = 'teacher-1';

beforeAll(async () => {
  ({ app } = await import('../../server/index'));
  ({ generateToken } = await import('../../server/utils/auth'));
});

beforeEach(() => {
  mockDb.reset();
  vi.restoreAllMocks();
});

const teacherToken = () => generateToken({ id: TEACHER_ID, role: 'teacher', name: 'Teacher A' });

describe('student bin APIs', () => {
  it('lists deleted records grouped by student and calculates retention days', async () => {
    const deletedAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    mockDb.queueSelect([{ id: TEACHER_ID, status: 'approved' }]);
    mockDb.queueSelect([{ id: STUDENT_ID, name: 'Alice', grade: 'P6', parentId: null }]);
    mockDb.queueSelect([
      {
        id: 'daily-1',
        studentId: STUDENT_ID,
        date: '2026-05-01',
        summary: '数学练习',
        deletedAt,
        deletedBy: TEACHER_ID,
        deletedByName: 'Teacher A',
      },
    ]);
    mockDb.queueSelect([]);
    mockDb.queueSelect([]);
    mockDb.queueSelect([]);
    mockDb.queueSelect([]);
    mockDb.queueSelect([]);
    mockDb.queueSelect([]);
    mockDb.queueSelect([]);

    const res = await request(app)
      .get(`/api/students/${STUDENT_ID}/bin`)
      .set('Authorization', `Bearer ${teacherToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.groups.dailyProgress).toHaveLength(1);
    expect(res.body.groups.dailyProgress[0]).toMatchObject({
      recordType: 'dailyProgress',
      recordId: 'daily-1',
      deletedByName: 'Teacher A',
    });
    expect(res.body.groups.dailyProgress[0].daysRemaining).toBeGreaterThanOrEqual(27);
  });

  it('restores a deleted daily progress record', async () => {
    mockDb.queueSelect([{ id: TEACHER_ID, status: 'approved' }]);
    mockDb.queueSelect([{ id: 'daily-1', studentId: STUDENT_ID, deletedAt: new Date('2026-05-01T00:00:00.000Z') }]);
    mockDb.queueUpdate([{ id: 'daily-1', studentId: STUDENT_ID, deletedAt: null }]);

    const res = await request(app)
      .post(`/api/students/${STUDENT_ID}/bin/restore`)
      .set('Authorization', `Bearer ${teacherToken()}`)
      .send({ recordType: 'dailyProgress', recordId: 'daily-1' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.record.deletedAt).toBeNull();
  });

  it('permanently deletes only records already in bin', async () => {
    mockDb.queueSelect([{ id: TEACHER_ID, status: 'approved' }]);
    mockDb.queueSelect([{ id: 'paper-1', studentId: STUDENT_ID, deletedAt: new Date('2026-05-01T00:00:00.000Z') }]);
    mockDb.queueDelete([{ id: 'paper-1' }]);

    const res = await request(app)
      .delete(`/api/students/${STUDENT_ID}/bin/permanent`)
      .set('Authorization', `Bearer ${teacherToken()}`)
      .send({ recordType: 'paper', recordId: 'paper-1' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, recordType: 'paper', recordId: 'paper-1' });
  });

  it('rejects permanent delete for active records', async () => {
    mockDb.queueSelect([{ id: TEACHER_ID, status: 'approved' }]);
    mockDb.queueSelect([{ id: 'paper-1', studentId: STUDENT_ID, deletedAt: null }]);

    const res = await request(app)
      .delete(`/api/students/${STUDENT_ID}/bin/permanent`)
      .set('Authorization', `Bearer ${teacherToken()}`)
      .send({ recordType: 'paper', recordId: 'paper-1' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Record is not in bin');
  });

  it('parents cannot access a student bin', async () => {
    const token = generateToken({ id: 'parent-1', role: 'parent', name: 'Parent A' });
    mockDb.queueSelect([{ id: 'parent-1', status: 'approved' }]);

    const res = await request(app)
      .get(`/api/students/${STUDENT_ID}/bin`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('cleanup is admin-only and returns per-type counts', async () => {
    const adminToken = generateToken({ id: 'admin-1', role: 'admin', name: 'Admin A' });
    mockDb.queueSelect([{ id: 'admin-1' }]);
    mockDb.queueDelete([{ id: 'daily-old' }]);
    mockDb.queueDelete([]);
    mockDb.queueDelete([{ id: 'report-old' }]);
    mockDb.queueDelete([]);
    mockDb.queueDelete([]);
    mockDb.queueDelete([{ id: 'paper-old' }]);
    mockDb.queueSelect([{ id: 'exam-old' }]);
    mockDb.queueDelete([]);
    mockDb.queueDelete([]);

    const res = await request(app)
      .post('/api/admin/bin/cleanup-expired')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.results.dailyProgress.count).toBe(1);
    expect(res.body.results.studentReports.count).toBe(1);
    expect(res.body.results.papers.count).toBe(1);
    expect(res.body.results.exams.count).toBe(1);
    expect(res.body.failures).toEqual([]);
  });

  it('allows parent directory and student creation for other teachers', async () => {
    mockDb.queueSelect([{ id: TEACHER_ID, status: 'approved' }]);
    mockDb.queueSelect([{ id: PARENT_ID, name: 'Parent A', status: 'approved' }]);

    const parentsRes = await request(app)
      .get('/api/parents')
      .set('Authorization', `Bearer ${teacherToken()}`);

    expect(parentsRes.status).toBe(200);
    expect(parentsRes.body).toHaveLength(1);

    mockDb.queueSelect([{ id: TEACHER_ID, status: 'approved' }]);
    mockDb.queueInsert([{ id: STUDENT_ID, name: 'Alice', grade: '中一', parentId: PARENT_ID }]);
    mockDb.queueSelect([{ id: 'english-subject' }]);
    mockDb.queueInsert([]);

    const createRes = await request(app)
      .post('/api/students')
      .set('Authorization', `Bearer ${teacherToken()}`)
      .send({ name: 'Alice', grade: '中一', parentId: PARENT_ID });

    expect(createRes.status).toBe(201);
    expect(createRes.body).toMatchObject({ id: STUDENT_ID, parentId: PARENT_ID });

    mockDb.queueSelect([{ id: TEACHER_ID, status: 'approved' }]);
    mockDb.queueSelect([{ id: TEACHER_ID, wechatOpenId: 'wx-other' }]);

    const managementRes = await request(app)
      .get(`/api/parents/${PARENT_ID}/students`)
      .set('Authorization', `Bearer ${teacherToken()}`);

    expect(managementRes.status).toBe(403);
  });
});
