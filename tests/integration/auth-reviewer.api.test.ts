import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDb } from '../helpers/mockDb';

const mockDb = createMockDb();

vi.mock('../../server/db', () => ({
  db: mockDb,
}));

let app: any;

beforeAll(async () => {
  process.env.REVIEWER_USERNAME = 'account';
  process.env.REVIEWER_PASSWORD = 'xyz2026!!';
  process.env.REVIEWER_STUDENT_ID = '11111111-1111-1111-1111-111111111111';
  process.env.REVIEWER_EMAIL = 'reviewer@local.edunet';
  ({ app } = await import('../../server/index'));
});

beforeEach(() => {
  mockDb.reset();
  vi.restoreAllMocks();
  vi.stubGlobal('fetch', vi.fn());
});

describe('POST /api/auth/reviewer-login', () => {
  it('allows login with valid reviewer credentials', async () => {
    mockDb.queueSelect([{ id: '11111111-1111-1111-1111-111111111111', name: 'Demo Student' }]);
    mockDb.queueSelect([
      {
        id: 'teacher-r1',
        name: '审核体验账号',
        displayName: '审核体验账号',
        status: 'approved',
        email: 'reviewer@local.edunet',
        authProvider: 'reviewer',
      },
    ]);

    const res = await request(app).post('/api/auth/reviewer-login').send({
      username: 'account',
      password: 'xyz2026!!',
    });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTypeOf('string');
    expect(res.body.user).toMatchObject({
      role: 'teacher',
      isReviewer: true,
      reviewerStudentId: '11111111-1111-1111-1111-111111111111',
    });
  });

  it('supports reviewer login route without /api prefix for gateway compatibility', async () => {
    mockDb.queueSelect([{ id: '11111111-1111-1111-1111-111111111111', name: 'Demo Student' }]);
    mockDb.queueSelect([
      {
        id: 'teacher-r1',
        name: '审核体验账号',
        displayName: '审核体验账号',
        status: 'approved',
        email: 'reviewer@local.edunet',
        authProvider: 'reviewer',
      },
    ]);

    const res = await request(app).post('/auth/reviewer-login').send({
      username: 'account',
      password: 'xyz2026!!',
    });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTypeOf('string');
    expect(res.body.user?.isReviewer).toBe(true);
  });

  it('rejects wrong reviewer password', async () => {
    const res = await request(app).post('/api/auth/reviewer-login').send({
      username: 'account',
      password: 'bad-pass',
    });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('账号或密码错误');
  });

  it('token works with existing auth middleware and reviewer scope', async () => {
    // login
    mockDb.queueSelect([{ id: '11111111-1111-1111-1111-111111111111', name: 'Demo Student' }]);
    mockDb.queueSelect([
      {
        id: 'teacher-r1',
        name: '审核体验账号',
        displayName: '审核体验账号',
        status: 'approved',
        email: 'reviewer@local.edunet',
        authProvider: 'reviewer',
      },
    ]);
    const login = await request(app).post('/api/auth/reviewer-login').send({
      username: 'account',
      password: 'xyz2026!!',
    });
    expect(login.status).toBe(200);

    const token = login.body.token as string;
    expect(typeof token).toBe('string');

    // authenticate -> verifyUserInDb(teacher by id)
    mockDb.queueSelect([
      {
        id: 'teacher-r1',
        name: '审核体验账号',
        displayName: '审核体验账号',
        status: 'approved',
      },
    ]);
    // /api/students reviewer only sees configured demo student
    mockDb.queueSelect([{ id: '11111111-1111-1111-1111-111111111111', name: 'Demo Student', grade: '中二' }]);

    const listRes = await request(app)
      .get('/api/students')
      .set('Authorization', `Bearer ${token}`);

    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body)).toBe(true);
    expect(listRes.body).toHaveLength(1);
    expect(listRes.body[0].id).toBe('11111111-1111-1111-1111-111111111111');
  });

  it('does not break normal wechat auth flow', async () => {
    (global.fetch as any).mockResolvedValue({
      json: async () => ({ openid: 'wx_open_teacher_1' }),
    });
    mockDb.queueSelect([
      {
        id: 'teacher-1',
        name: 'Teacher A',
        displayName: 'Teacher A',
        status: 'approved',
        authProvider: 'wechat',
        wechatOpenId: 'wx_open_teacher_1',
      },
    ]);

    const res = await request(app).post('/api/auth/wechat').send({
      code: 'wechat-code',
      role: 'teacher',
      nickname: 'Teacher A',
    });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTypeOf('string');
    expect(res.body.user?.role).toBe('teacher');
  });
});
