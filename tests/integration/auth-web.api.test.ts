import express from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDb } from '../helpers/mockDb';
const mockDb = createMockDb();
vi.mock('../../server/db', () => ({ db: mockDb }));
let app: express.Express;
beforeAll(async () => {
  const { webAuthRouter } = await import('../../server/auth/web');
  app = express().use(express.json()).use('/api/auth/web', webAuthRouter);
});
beforeEach(() => {
  mockDb.reset();
  vi.stubEnv('JWT_SECRET', 'test-secret');
  vi.stubEnv('API_PUBLIC_URL', 'http://localhost:3003');
  vi.stubEnv('WEB_APP_URL', 'http://localhost:5173');
  vi.stubEnv('GOOGLE_CLIENT_ID', 'google-client');
  vi.stubEnv('GOOGLE_CLIENT_SECRET', 'google-secret');
  vi.stubEnv('WECHAT_WEB_APP_ID', 'wechat-client');
  vi.stubEnv('WECHAT_WEB_APP_SECRET', 'wechat-secret');
});
const root = '/api/auth/web';
const payload = { role: 'parent', name: 'New Parent', email: 'parent@example.com', password: 'a-long-password' };
async function start(provider = 'google') {
  const res = await request(app).get(`${root}/${provider}/start?role=parent`);
  return { state: new URL(res.headers.location).searchParams.get('state'), cookie: res.headers['set-cookie'][0].split(';')[0], res };
}
function response(data: object) { return { ok: true, json: async () => data }; }
describe('browser authentication', () => {
  it('creates a pending account with a salted password and no token', async () => {
    const insert = vi.spyOn(mockDb, 'insert');
    const values = vi.fn().mockResolvedValue([]); insert.mockReturnValueOnce({ values } as never);
    const res = await request(app).post(`${root}/register`).send(payload);
    expect(res.status).toBe(201); expect(res.body.token).toBeUndefined();
    expect(values.mock.calls[0][0]).toMatchObject({ status: 'pending', authProvider: 'email', password: expect.stringMatching(/^scrypt\$/) });
  });
  it('rejects admin signup and weak passwords', async () => {
    expect((await request(app).post(`${root}/register`).send({ ...payload, role: 'admin' })).status).toBe(400);
    expect((await request(app).post(`${root}/register`).send({ ...payload, password: 'short' })).status).toBe(400);
  });
  it('does not replace duplicate accounts', async () => {
    mockDb.queueSelect([{ id: 'existing' }]);
    expect((await request(app).post(`${root}/register`).send(payload)).status).toBe(409);
  });
  it('reports unavailable providers', async () => {
    vi.stubEnv('GOOGLE_CLIENT_SECRET', '');
    expect((await request(app).get(`${root}/providers`)).body.google).toBe(false);
    expect((await request(app).get(`${root}/google/start?role=parent`)).status).toBe(503);
  });
  it('sends WeChat users to the real QR authorization page', async () => {
    const { res } = await start('wechat');
    const url = new URL(res.headers.location);
    expect(url.origin + url.pathname).toBe('https://open.weixin.qq.com/connect/qrconnect');
    expect(url.searchParams.get('scope')).toBe('snsapi_login');
    expect(res.headers['set-cookie'][0]).toContain('HttpOnly');
  });
  it('rejects callback state mismatch before contacting providers', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const { cookie } = await start();
    const res = await request(app).get(`${root}/google/callback?state=wrong&code=code`).set('Cookie', cookie);
    expect(res.headers.location).toContain('result=failed'); expect(fetcher).not.toHaveBeenCalled();
  });
  it('rejects callbacks without the browser cookie', async () => {
    const { state } = await start();
    const res = await request(app).get(`${root}/google/callback?state=${state}&code=code`);
    expect(res.headers.location).toContain('result=failed');
  });
  it('creates a pending Google identity without granting a session', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response({ access_token: 'access' })).mockResolvedValueOnce(response({ sub: 'subject', email: 'new@example.com', email_verified: true, name: 'New user' })));
    mockDb.queueSelect([]); mockDb.queueSelect([]); mockDb.queueInsert([{ id: 'new', status: 'pending' }]);
    const { state, cookie } = await start();
    const res = await request(app).get(`${root}/google/callback?state=${state}&code=code`).set('Cookie', cookie);
    expect(res.headers.location).toContain('pending_approval');
    expect(res.headers['set-cookie'].join()).not.toContain('edunet_oauth_session');
  });
  it('does not link an existing email account implicitly', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response({ access_token: 'access' })).mockResolvedValueOnce(response({ sub: 'subject', email: 'parent@example.com', email_verified: true })));
    mockDb.queueSelect([]); mockDb.queueSelect([{ id: 'existing' }]);
    const { state, cookie } = await start();
    const res = await request(app).get(`${root}/google/callback?state=${state}&code=code`).set('Cookie', cookie);
    expect(res.headers.location).toContain('account_exists');
  });
  it('recognizes a mini-program user by UnionID without overwriting their OpenID', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response({ access_token: 'access', openid: 'web-open' })).mockResolvedValueOnce(response({ openid: 'web-open', unionid: 'shared', nickname: 'Parent' })));
    mockDb.queueSelect([]); mockDb.queueSelect([{ id: 'existing', name: 'Parent', status: 'approved', wechatOpenId: 'mini-open' }]);
    const { state, cookie } = await start('wechat');
    const res = await request(app).get(`${root}/wechat/callback?state=${state}&code=code`).set('Cookie', cookie);
    expect(res.headers.location).toContain('result=success');
    expect(res.headers.location).not.toContain('token');
    const session = res.headers['set-cookie'].find((v: string) => v.startsWith('edunet_oauth_session='));
    mockDb.queueSelect([{ id: 'existing', status: 'approved' }]);
    const exchange = await request(app).post(`${root}/session`).set('Origin', 'http://localhost:5173').set('Cookie', session.split(';')[0]);
    expect(exchange.status).toBe(200); expect(exchange.body.token).toBeTruthy();
  });
  it('rejects unverified Google email addresses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response({ access_token: 'access' })).mockResolvedValueOnce(response({ sub: 'subject', email: 'new@example.com', email_verified: false })));
    const { state, cookie } = await start();
    const res = await request(app).get(`${root}/google/callback?state=${state}&code=code`).set('Cookie', cookie);
    expect(res.headers.location).toContain('result=failed');
  });
  it('never issues a session for a rejected social account', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response({ access_token: 'access' })).mockResolvedValueOnce(response({ sub: 'subject', email: 'new@example.com', email_verified: true })));
    mockDb.queueSelect([{ id: 'rejected', status: 'rejected' }]);
    const { state, cookie } = await start();
    const res = await request(app).get(`${root}/google/callback?state=${state}&code=code`).set('Cookie', cookie);
    expect(res.headers.location).toContain('result=rejected');
    expect(res.headers['set-cookie'].join()).not.toContain('edunet_oauth_session');
  });
  it('rejects session exchanges from another origin', async () => {
    expect((await request(app).post(`${root}/session`).set('Origin', 'https://evil.example')).status).toBe(403);
  });
});
