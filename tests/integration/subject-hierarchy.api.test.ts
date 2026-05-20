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

beforeAll(async () => {
  ({ app } = await import('../../server/index'));
  ({ generateToken } = await import('../../server/utils/auth'));
});

beforeEach(() => {
  mockDb.reset();
  vi.restoreAllMocks();
});

describe('subject hierarchy APIs', () => {
  it('falls back legacy subjects without levelId to default O-Level', async () => {
    const token = generateToken({ id: 'teacher-1', role: 'teacher', name: 'Teacher A' });
    const defaultLevel = {
      id: 'level-olevel',
      name: 'O-Level',
      description: 'default',
      sortOrder: 0,
      isDefault: true,
      isActive: true,
    };

    mockDb.queueSelect([{ id: 'teacher-1', status: 'approved' }]); // auth
    mockDb.queueSelect([defaultLevel]); // ensureDefaultSubjectLevel
    mockDb.queueSelect([defaultLevel]); // levels list
    mockDb.queueSelect([
      {
        id: 'subject-1',
        code: 'MATH',
        name: '数学',
        chineseName: '数学',
        englishName: 'Math',
        level: 'legacy',
        levelId: null,
        isRequired: false,
        sortOrder: 0,
        isActive: true,
      },
    ]); // subject rows
    mockDb.queueSelect([]); // topic rows

    const res = await request(app)
      .get('/api/subjects/hierarchy')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.levels)).toBe(true);
    const foundLevel = res.body.levels.find((level: { id: string }) => level.id === 'level-olevel');
    expect(foundLevel).toBeTruthy();
    const foundSubject = (foundLevel?.subjects || []).find((subject: { id: string; levelId: string }) => subject.id === 'subject-1');
    expect(foundSubject.levelId).toBe('level-olevel');
  });

  it('prevents deleting non-empty level', async () => {
    const token = generateToken({ id: 'teacher-1', role: 'teacher', name: 'Teacher A' });
    const levelId = 'level-sec1';

    mockDb.queueSelect([{ id: 'teacher-1', status: 'approved' }]); // auth
    mockDb.queueSelect([
      { id: levelId, name: 'Sec 1', isDefault: false },
    ]); // existing level
    mockDb.queueSelect([
      { id: 'subject-1' },
    ]); // usedSubjects

    const res = await request(app)
      .delete(`/api/subject-levels/${levelId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(String(res.body.error || '')).toContain('Level has subjects');
  });
});
