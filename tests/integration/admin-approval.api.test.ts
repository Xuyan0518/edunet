import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDb } from '../helpers/mockDb';

const mockDb = createMockDb();

vi.mock('../../server/db', () => ({
  db: mockDb,
}));

let app: any;
let generateToken: typeof import('../../server/utils/auth').generateToken;

beforeAll(async () => {
  ({ app } = await import('../../server/index'));
  ({ generateToken } = await import('../../server/utils/auth'));
});

beforeEach(() => {
  mockDb.reset();
});

describe('admin approval APIs', () => {
  it('returns 401 on admin pending endpoint without token', async () => {
    const res = await request(app).get('/api/admin/pending');
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin token on pending endpoint', async () => {
    const teacherToken = generateToken({ id: 'teacher-1', role: 'teacher', name: 'Teacher' });
    mockDb.queueSelect([{ id: 'teacher-1', status: 'approved' }]);

    const res = await request(app)
      .get('/api/admin/pending')
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(res.status).toBe(403);
  });

  it('returns pending teacher/parent lists for admin', async () => {
    const adminToken = generateToken({ id: 'admin-1', role: 'admin', name: 'Admin' });
    mockDb.queueSelect([{ id: 'admin-1' }]);
    mockDb.queueSelect([
      { id: 'parent-1', name: 'P1', displayName: 'Parent 1', status: 'pending', wechatOpenId: 'wxp111111' },
    ]);
    mockDb.queueSelect([
      { id: 'teacher-1', name: 'T1', displayName: 'Teacher 1', status: 'pending', wechatOpenId: 'wxt111111' },
    ]);

    const res = await request(app)
      .get('/api/admin/pending')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.parents).toHaveLength(1);
    expect(res.body.teachers).toHaveLength(1);
    expect(res.body.parents[0]).toMatchObject({ role: 'parent', status: 'pending' });
  });

  it('approves pending teacher as admin', async () => {
    const adminToken = generateToken({ id: 'admin-1', role: 'admin', name: 'Admin' });
    mockDb.queueSelect([{ id: 'admin-1' }]);
    mockDb.queueUpdate([]);

    const res = await request(app)
      .post('/api/admin/approve')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ id: 'teacher-1', role: 'teacher' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });
});
