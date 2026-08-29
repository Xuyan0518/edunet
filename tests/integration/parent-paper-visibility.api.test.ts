import type { Express } from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockDb } from '../helpers/mockDb';

const mockDb = createMockDb();

vi.mock('../../server/db', () => ({
  db: mockDb,
  executeAtomicBatch: vi.fn(),
}));

let app: Express;
let generateToken: typeof import('../../server/utils/auth').generateToken;

beforeAll(async () => {
  ({ app } = await import('../../server/index'));
  ({ generateToken } = await import('../../server/utils/auth'));
});

beforeEach(() => mockDb.reset());

describe('parent paper visibility', () => {
  it('selects and returns only parent-visible paper fields', async () => {
    const token = generateToken({ id: 'parent-1', role: 'parent', name: 'Parent' });
    mockDb.queueSelect([{ id: 'parent-1', status: 'approved' }]);
    mockDb.queueSelect([{ id: 'student-1', parentId: 'parent-1' }]);
    mockDb.queueSelect([{
      id: 'paper-1',
      studentId: 'student-1',
      subjectName: 'English',
      description: 'Practice paper',
      date: '2026-08-29',
      score: 18,
      total: 20,
    }]);
    mockDb.queueSelect([{ updatedAt: new Date('2026-08-29T10:00:00Z') }]);

    const response = await request(app)
      .get('/api/students/student-1/papers?date=2026-08-29')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.headers['x-papers-updated-at']).toBeUndefined();
    expect(response.body).toEqual([expect.objectContaining({
      id: 'paper-1',
      studentId: 'student-1',
      subjectName: 'English',
      description: 'Practice paper',
      date: '2026-08-29',
      score: 18,
      total: 20,
    })]);
    expect(response.body[0]).not.toHaveProperty('strengths');
    expect(response.body[0]).not.toHaveProperty('improvements');
    expect(response.body[0]).not.toHaveProperty('updatedAt');

    const paperProjection = mockDb.getSelectArguments()[2] as Record<string, unknown>;
    expect(Object.keys(paperProjection)).toEqual([
      'id',
      'studentId',
      'subjectName',
      'description',
      'date',
      'score',
      'total',
    ]);
  });
});
