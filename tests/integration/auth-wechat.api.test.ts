import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDb } from '../helpers/mockDb';

const mockDb = createMockDb();

vi.mock('../../server/db', () => ({
  db: mockDb,
}));

let app: any;

beforeAll(async () => {
  ({ app } = await import('../../server/index'));
});

beforeEach(() => {
  mockDb.reset();
  vi.restoreAllMocks();
  vi.stubGlobal('fetch', vi.fn());
});

describe('POST /api/auth/wechat', () => {
  it('returns 400 when code is missing', async () => {
    const res = await request(app).post('/api/auth/wechat').send({ role: 'teacher' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Missing code');
  });

  it('creates pending teacher on first wechat login', async () => {
    (global.fetch as any).mockResolvedValue({
      json: async () => ({ openid: 'wx_open_1' }),
    });

    mockDb.queueSelect([]);
    mockDb.queueInsert([
      {
        id: 'teacher-1',
        name: 'Teacher A',
        displayName: 'Teacher A',
        status: 'pending',
        authProvider: 'wechat',
        wechatOpenId: 'wx_open_1',
      },
    ]);

    const res = await request(app).post('/api/auth/wechat').send({
      code: 'wechat-code',
      role: 'teacher',
      nickname: 'Teacher A',
      avatarUrl: 'https://img.example.com/a.png',
    });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('pending_approval');
    expect(res.body.token).toBeUndefined();
    expect(res.body.user).toMatchObject({
      role: 'teacher',
      displayName: 'Teacher A',
      status: 'pending',
    });
  });

  it('returns 400 for unsupported role', async () => {
    const res = await request(app).post('/api/auth/wechat').send({
      code: 'wechat-code',
      role: 'student',
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid role');
  });

  it('returns 401 when wechat code exchange fails', async () => {
    (global.fetch as any).mockResolvedValue({
      json: async () => ({ errcode: 40029, errmsg: 'invalid code' }),
    });

    const res = await request(app).post('/api/auth/wechat').send({
      code: 'bad-code',
      role: 'teacher',
    });

    expect(res.status).toBe(401);
    expect(res.body.error).toContain('invalid code');
  });

  it('returns token for approved teacher', async () => {
    (global.fetch as any).mockResolvedValue({
      json: async () => ({ openid: 'wx_open_2' }),
    });

    mockDb.queueSelect([
      {
        id: 'teacher-2',
        name: 'Teacher B',
        displayName: 'Teacher B',
        status: 'approved',
        authProvider: 'wechat',
        wechatOpenId: 'wx_open_2',
      },
    ]);

    const res = await request(app).post('/api/auth/wechat').send({
      code: 'wechat-code',
      role: 'teacher',
      nickname: 'Teacher B',
    });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTypeOf('string');
    expect(res.body.user).toMatchObject({ role: 'teacher', displayName: 'Teacher B' });
  });

  it('blocks pending teacher from full login', async () => {
    (global.fetch as any).mockResolvedValue({
      json: async () => ({ openid: 'wx_open_3' }),
    });

    mockDb.queueSelect([
      {
        id: 'teacher-3',
        name: 'Teacher C',
        displayName: 'Teacher C',
        status: 'pending',
        authProvider: 'wechat',
        wechatOpenId: 'wx_open_3',
      },
    ]);

    const res = await request(app).post('/api/auth/wechat').send({
      code: 'wechat-code',
      role: 'teacher',
      nickname: 'Teacher C',
    });

    expect(res.status).toBe(401);
    expect(res.body.status).toBe('pending_approval');
  });

  it('rejects unauthorized admin wechat account', async () => {
    (global.fetch as any).mockResolvedValue({
      json: async () => ({ openid: 'wx_admin_unauthorized' }),
    });

    mockDb.queueSelect([]);

    const res = await request(app).post('/api/auth/wechat').send({
      code: 'wechat-code',
      role: 'admin',
      nickname: 'Admin',
    });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('admin_not_authorized');
  });
});
