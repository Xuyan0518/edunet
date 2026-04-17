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

describe('/api/profile', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/profile');
    expect(res.status).toBe(401);
  });

  it('returns current teacher profile for valid token', async () => {
    const token = generateToken({ id: 'teacher-1', role: 'teacher', name: 'Teacher A' });
    mockDb.queueSelect([{ id: 'teacher-1', status: 'approved' }]);
    mockDb.queueSelect([
      {
        id: 'teacher-1',
        name: 'Teacher A',
        displayName: 'Teacher A',
        status: 'approved',
        authProvider: 'wechat',
        wechatOpenId: 'wx_teacher_1',
      },
    ]);

    const res = await request(app).get('/api/profile').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ role: 'teacher', displayName: 'Teacher A' });
  });

  it('returns 400 when profile update payload is empty', async () => {
    const token = generateToken({ id: 'teacher-1', role: 'teacher', name: 'Teacher A' });
    mockDb.queueSelect([{ id: 'teacher-1', status: 'approved' }]);

    const res = await request(app)
      .put('/api/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it('updates teacher profile display name and avatar', async () => {
    const token = generateToken({ id: 'teacher-1', role: 'teacher', name: 'Teacher A' });
    mockDb.queueSelect([{ id: 'teacher-1', status: 'approved' }]);
    mockDb.queueUpdate([
      {
        id: 'teacher-1',
        name: 'Teacher New',
        displayName: 'Teacher New',
        avatarUrl: 'https://img.example.com/new.png',
        status: 'approved',
        authProvider: 'wechat',
        wechatOpenId: 'wx_teacher_1',
      },
    ]);

    const res = await request(app)
      .put('/api/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ displayName: 'Teacher New', avatarUrl: 'https://img.example.com/new.png' });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      role: 'teacher',
      displayName: 'Teacher New',
      avatarUrl: 'https://img.example.com/new.png',
    });
  });
});
