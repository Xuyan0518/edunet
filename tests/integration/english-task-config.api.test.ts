import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Express } from 'express';
import { createMockDb } from '../helpers/mockDb';

const mockDb = createMockDb();

vi.mock('../../server/db', () => ({
  db: mockDb,
}));

vi.mock('../../server/services/actionLocks', () => ({
  withActionLock: async (_opts: unknown, callback: () => Promise<unknown>) => callback(),
  isActionLockConflictError: () => false,
  buildActionLockConflictPayload: () => ({ error: 'ACTION_LOCKED' }),
}));

let app: Express;
let generateToken: typeof import('../../server/utils/auth').generateToken;

const STUDENT_ID = '11111111-1111-4111-8111-111111111111';

beforeAll(async () => {
  ({ app } = await import('../../server/index'));
  ({ generateToken } = await import('../../server/utils/auth'));
});

beforeEach(() => {
  mockDb.reset();
  vi.restoreAllMocks();
});

describe('student english task config APIs', () => {
  it('returns default tasks when student has no custom config', async () => {
    const token = generateToken({ id: 'teacher-1', role: 'teacher', name: 'Teacher A' });

    mockDb.queueSelect([{ id: 'teacher-1', status: 'approved' }]); // auth
    mockDb.queueSelect([{ id: STUDENT_ID, name: 'Alice', grade: 'G7', parentId: null }]); // getStudentById
    mockDb.queueSelect([]); // config table

    const res = await request(app)
      .get(`/api/students/${STUDENT_ID}/english-tasks`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.isDefault).toBe(true);
    expect(Array.isArray(res.body.tasks)).toBe(true);
    expect(res.body.tasks[0].key).toBe('editing');
  });

  it('saves and reads custom english task config', async () => {
    const token = generateToken({ id: 'teacher-1', role: 'teacher', name: 'Teacher A' });

    mockDb.queueSelect([{ id: 'teacher-1', status: 'approved' }]); // auth for PUT
    mockDb.queueSelect([{ id: STUDENT_ID, name: 'Alice', grade: 'G7', parentId: null }]); // getStudentById in PUT
    mockDb.queueSelect([]); // existing config in PUT

    const putRes = await request(app)
      .put(`/api/students/${STUDENT_ID}/english-tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        tasks: [
          {
            id: 'listening_1',
            key: 'listening',
            chineseName: '听力',
            englishName: 'Listening',
            displayName: '听力 (Listening)',
            weeklyTargetCount: 4,
            enabled: true,
            enabledFields: ['practiceCount', 'score', 'problems'],
            sortOrder: 0,
          },
        ],
      });

    expect(putRes.status).toBe(200);
    expect(putRes.body.isDefault).toBe(false);
    expect(putRes.body.tasks[0].key).toBe('listening');

    mockDb.queueSelect([{ id: 'teacher-1', status: 'approved' }]); // auth for GET
    mockDb.queueSelect([{ id: STUDENT_ID, name: 'Alice', grade: 'G7', parentId: null }]); // getStudentById in GET
    mockDb.queueSelect([
      {
        id: 'cfg-1',
        studentId: STUDENT_ID,
        tasksJson: [
          {
            id: 'listening_1',
            key: 'listening',
            chineseName: '听力',
            englishName: 'Listening',
            displayName: '听力 (Listening)',
            weeklyTargetCount: 4,
            enabled: true,
            enabledFields: ['practiceCount', 'score', 'problems'],
            sortOrder: 0,
          },
        ],
      },
    ]);

    const getRes = await request(app)
      .get(`/api/students/${STUDENT_ID}/english-tasks`)
      .set('Authorization', `Bearer ${token}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.isDefault).toBe(false);
    expect(getRes.body.tasks[0].displayName).toBe('听力 (Listening)');
  });

  it('blocks parent role from updating config', async () => {
    const token = generateToken({ id: 'parent-1', role: 'parent', name: 'Parent A' });
    mockDb.queueSelect([{ id: 'parent-1', status: 'approved' }]); // auth

    const res = await request(app)
      .put(`/api/students/${STUDENT_ID}/english-tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({ tasks: [] });

    expect(res.status).toBe(403);
  });
});
