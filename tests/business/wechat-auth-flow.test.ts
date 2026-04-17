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
  vi.restoreAllMocks();
  vi.stubGlobal('fetch', vi.fn());
});

describe('business flow: wechat login -> admin approval -> usable account', () => {
  it('supports full teacher onboarding lifecycle', async () => {
    (global.fetch as any).mockResolvedValue({
      json: async () => ({ openid: 'wx_teacher_flow' }),
    });

    // Step 1: first login creates a pending account.
    mockDb.queueSelect([]);
    mockDb.queueInsert([
      {
        id: 'teacher-flow-1',
        name: 'Flow Teacher',
        displayName: 'Flow Teacher',
        status: 'pending',
        authProvider: 'wechat',
        wechatOpenId: 'wx_teacher_flow',
      },
    ]);

    const firstLogin = await request(app).post('/api/auth/wechat').send({
      code: 'first-code',
      role: 'teacher',
      nickname: 'Flow Teacher',
    });

    expect(firstLogin.status).toBe(200);
    expect(firstLogin.body.status).toBe('pending_approval');
    expect(firstLogin.body.user.id).toBe('teacher-flow-1');

    // Step 2: admin approves the teacher.
    const adminToken = generateToken({ id: 'admin-1', role: 'admin', name: 'Admin' });
    mockDb.queueSelect([{ id: 'admin-1' }]);
    mockDb.queueUpdate([]);

    const approve = await request(app)
      .post('/api/admin/approve')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ id: 'teacher-flow-1', role: 'teacher' });

    expect(approve.status).toBe(200);
    expect(approve.body.success).toBe(true);

    // Step 3: second login now succeeds and returns token.
    mockDb.queueSelect([
      {
        id: 'teacher-flow-1',
        name: 'Flow Teacher',
        displayName: 'Flow Teacher',
        status: 'approved',
        authProvider: 'wechat',
        wechatOpenId: 'wx_teacher_flow',
      },
    ]);

    const secondLogin = await request(app).post('/api/auth/wechat').send({
      code: 'second-code',
      role: 'teacher',
      nickname: 'Flow Teacher',
    });

    expect(secondLogin.status).toBe(200);
    expect(secondLogin.body.token).toBeTypeOf('string');
    expect(secondLogin.body.user).toMatchObject({ role: 'teacher', status: 'approved' });
  });
});
