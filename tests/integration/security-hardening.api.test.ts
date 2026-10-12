import request from 'supertest';
import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createMockDb } from '../helpers/mockDb';
import { hashPassword } from '../../server/auth/password';

const db = createMockDb();
vi.mock('../../server/db', () => ({ db }));
vi.mock('dotenv', () => ({ default: { config: vi.fn() } }));
vi.mock('../../server/utils/wechatNotify', () => ({ sendWeChatSubscribeMessage: vi.fn() }));
let app: Parameters<typeof request>[0];
let generateToken: typeof import('../../server/utils/auth').generateToken;
const demo = '11111111-1111-4111-8111-111111111111';
const foreign = '22222222-2222-4222-8222-222222222222';

beforeAll(async () => {
  vi.stubEnv('REVIEWER_USERNAME', 'private-reviewer');
  vi.stubEnv('REVIEWER_PASSWORD', 'private-reviewer-test-password');
  vi.stubEnv('REVIEWER_STUDENT_ID', demo);
  ({ app } = await import('../../server/index'));
  ({ generateToken } = await import('../../server/utils/auth'));
});
beforeEach(() => {
  db.reset();
  vi.stubEnv('REVIEWER_LOGIN_ENABLED', 'true');
  vi.stubEnv('REVIEWER_STUDENT_ID', demo);
  vi.stubEnv('NODE_ENV', 'test');
});
afterEach(() => vi.unstubAllEnvs());

describe('administrator password login', () => {
  it('accepts a salted hash and omits password from the session', async () => {
    db.queueSelect([{ id: 'admin', name: 'Admin', password: await hashPassword('correct-password') }]);
    const res = await request(app).post('/api/admin/login').send({ email: 'ADMIN@example.test', password: 'correct-password' });
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.token).toBeTypeOf('string');
    expect(res.body.user.password).toBeUndefined();
  });
  it('rejects incorrect passwords without writes or tokens', async () => {
    db.queueSelect([{ id: 'admin', password: await hashPassword('correct-password') }]);
    const write = vi.spyOn(db, 'update');
    const res = await request(app).post('/api/admin/login').send({ email: 'admin@example.test', password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.body.token).toBeUndefined();
    expect(write).not.toHaveBeenCalled();
  });
  it('upgrades a legacy development credential before issuing a session', async () => {
    db.queueSelect([{ id: 'admin', name: 'Admin', password: 'legacy-password' }]);
    db.queueUpdate([{ id: 'admin' }]);
    const set = vi.fn().mockReturnValue({ where: () => ({ returning: async () => [{ id: 'admin' }] }) });
    vi.spyOn(db, 'update').mockReturnValueOnce({ set } as never);
    const res = await request(app).post('/api/admin/login').send({ email: 'admin@example.test', password: 'legacy-password' });
    expect(res.status).toBe(200);
    expect(set.mock.calls[0][0].password).toMatch(/^scrypt\$/);
    expect(set.mock.calls[0][0].password).not.toContain('legacy-password');
  });
  it('rejects plaintext storage in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    db.queueSelect([{ id: 'admin', password: 'legacy-password' }]);
    const res = await request(app).post('/api/admin/login').send({ email: 'admin@example.test', password: 'legacy-password' });
    expect(res.status).toBe(401);
    expect(res.body.token).toBeUndefined();
  });
  it('does not issue a token when a concurrent legacy upgrade misses its row', async () => {
    db.queueSelect([{ id: 'admin', password: 'legacy-password' }]);
    db.queueUpdate([]);
    const res = await request(app).post('/api/admin/login').send({ email: 'admin@example.test', password: 'legacy-password' });
    expect(res.status).toBe(401);
    expect(res.body.token).toBeUndefined();
  });
});

describe('reviewer restrictions', () => {
  it.each(['/api/auth/reviewer-login', '/auth/reviewer-login'])('disables reviewer login at %s by default in production', async path => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('REVIEWER_LOGIN_ENABLED', 'false');
    const read = vi.spyOn(db, 'select');
    const res = await request(app).post(path).send({ username: 'private-reviewer', password: 'private-reviewer-test-password' });
    expect(res.status).toBe(404);
    expect(read).not.toHaveBeenCalled();
  });
  const globalWrites = [
    ['post', '/api/academic-terms'], ['put', '/api/academic-terms/term'], ['delete', '/api/academic-terms/term'],
    ['post', '/api/weekly-cycles'], ['post', '/api/grade-weekly-plans'],
    ['post', '/api/subject-levels'], ['put', '/api/subject-levels/level'], ['delete', '/api/subject-levels/level'],
    ['post', '/api/subjects'], ['put', '/api/subjects/subject'], ['delete', '/api/subjects/subject'],
    ['post', '/api/subjects/subject/topics'], ['put', '/api/topics/topic'], ['delete', '/api/topics/topic'],
    ['post', '/api/paper-types'], ['delete', '/api/paper-types/type'],
    ['post', '/api/paper-schools'], ['delete', '/api/paper-schools/school'], ['put', '/api/profile'],
  ] as const;
  it.each(globalWrites)('blocks reviewer %s %s before global reads or writes', async (method, path) => {
    db.queueSelect([{ id: 'reviewer', status: 'approved', authProvider: 'reviewer' }]);
    const read = vi.spyOn(db, 'select');
    const writes = [vi.spyOn(db, 'insert'), vi.spyOn(db, 'update'), vi.spyOn(db, 'delete')];
    const token = generateToken({ id: 'reviewer', role: 'teacher', name: 'Reviewer', isReviewer: true, reviewerStudentId: demo });
    const res = await request(app)[method](path).set('Authorization', `Bearer ${token}`).send({ studentId: demo });
    expect(res.status).toBe(403);
    expect(read).toHaveBeenCalledTimes(1); // Only authentication.
    for (const write of writes) expect(write).not.toHaveBeenCalled();
  });
  it('revokes existing reviewer tokens when reviewer login is disabled', async () => {
    vi.stubEnv('REVIEWER_LOGIN_ENABLED', 'false');
    const token = generateToken({ id: 'reviewer', role: 'teacher', name: 'Reviewer', isReviewer: true, reviewerStudentId: demo });
    const res = await request(app).get('/api/students').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });
  it('rejects an unrestricted teacher token for a reviewer database identity', async () => {
    db.queueSelect([{ id: 'reviewer', status: 'approved', authProvider: 'reviewer' }]);
    const token = generateToken({ id: 'reviewer', role: 'teacher', name: 'Reviewer' });
    expect((await request(app).get('/api/students').set('Authorization', `Bearer ${token}`)).status).toBe(401);
  });
  it.each([[demo, 200], [foreign, 403]])('retains only scoped demo-student access (%s)', async (studentId, status) => {
    db.queueSelect([{ id: 'reviewer', status: 'approved', authProvider: 'reviewer' }]);
    db.queueSelect([{ id: demo, name: 'Demo Student' }]);
    const token = generateToken({ id: 'reviewer', role: 'teacher', name: 'Reviewer', isReviewer: true, reviewerStudentId: demo });
    expect((await request(app).get(`/api/students/${studentId}`).set('Authorization', `Bearer ${token}`)).status).toBe(status);
  });
  it('refuses to convert an ordinary teacher to a reviewer identity', async () => {
    db.queueSelect([{ id: demo }]);
    db.queueSelect([{ id: 'ordinary', status: 'approved', authProvider: 'email' }]);
    const write = vi.spyOn(db, 'update');
    const res = await request(app).post('/api/auth/reviewer-login').send({ username: 'private-reviewer', password: 'private-reviewer-test-password' });
    expect(res.status).toBe(503);
    expect(write).not.toHaveBeenCalled();
  });
  it.each(['/api/subject-levels', '/api/subjects/hierarchy', `/api/students/${demo}/subjects/full`])('does not initialize global catalog data during reviewer reads (%s)', async path => {
    db.queueSelect([{ id: 'reviewer', status: 'approved', authProvider: 'reviewer' }]);
    const write = vi.spyOn(db, 'insert');
    const token = generateToken({ id: 'reviewer', role: 'teacher', name: 'Reviewer', isReviewer: true, reviewerStudentId: demo });
    await request(app).get(path).set('Authorization', `Bearer ${token}`);
    expect(write).not.toHaveBeenCalled();
  });
  it('retains ordinary teacher and administrator access to global mutation handlers', async () => {
    for (const role of ['teacher', 'admin'] as const) {
      db.queueSelect([{ id: role, status: 'approved' }]);
      const token = generateToken({ id: role, role, name: role });
      // Invalid business input reaches validation, proving the reviewer guard
      // admits real teaching authors without changing any global records.
      const res = await request(app).post('/api/academic-terms').set('Authorization', `Bearer ${token}`).send({});
      expect(res.status).toBe(400);
    }
  });
});

describe('student data and diagnostics privacy', () => {
  it('does not log or echo a malformed JSON body', async () => {
    const output = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await request(app).post('/api/progress').set('Content-Type', 'application/json').send('{"summary":"PRIVATE-STUDENT-CONTENT", broken');
    expect(res.status).toBe(400);
    expect(JSON.stringify([res.body, output.mock.calls])).not.toContain('PRIVATE-STUDENT-CONTENT');
  });
  it.each(['/api/test-env', '/api/test-gmail'])('returns 404 for production diagnostics %s without invoking services', async path => {
    vi.stubEnv('NODE_ENV', 'production');
    expect((await request(app).get(path)).status).toBe(404);
  });
  it.each(['/api/test-env', '/api/test-gmail', '/api/progress', '/api/feedback'])('requires authentication for %s', async path => {
    expect((await request(app).get(path)).status).toBe(401);
  });
  it('does not log returned student records or load unrelated records for a daily read', async () => {
    const output = vi.spyOn(console, 'log').mockImplementation(() => {});
    db.queueSelect([{ id: 'teacher', status: 'approved' }]);
    db.queueSelect([{ id: 'record', studentId: demo, summary: 'PRIVATE-STUDENT-CONTENT', activities: [] }]);
    const read = vi.spyOn(db, 'select');
    const token = generateToken({ id: 'teacher', role: 'teacher', name: 'Teacher' });
    const res = await request(app).get(`/api/progress/student?studentId=${demo}&date=2026-10-11`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.summary).toBe('PRIVATE-STUDENT-CONTENT');
    expect(read).toHaveBeenCalledTimes(2); // Authentication + scoped daily record.
    expect(output).not.toHaveBeenCalled();
  });
  it('does not expose database error details in responses or logs', async () => {
    const output = vi.spyOn(console, 'error').mockImplementation(() => {});
    db.queueSelect([{ id: 'teacher', status: 'approved' }]);
    const normalRead = db.select;
    let reads = 0;
    vi.spyOn(db, 'select').mockImplementation(() => {
      if (++reads > 1) throw Object.assign(new Error('PRIVATE-STUDENT-CONTENT SECRET-CREDENTIAL SQL'), { params: ['PRIVATE-STUDENT-CONTENT'] });
      return normalRead();
    });
    const token = generateToken({ id: 'teacher', role: 'teacher', name: 'Teacher' });
    const res = await request(app).get(`/api/students/${demo}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(500);
    expect(JSON.stringify([res.body, output.mock.calls])).not.toMatch(/PRIVATE-STUDENT|SECRET-CREDENTIAL/);
  });
});

// Last: deliberately exhaust the real registered administrator limiter.
it('throttles administrator login on the actual endpoint before database work', async () => {
  let res;
  for (let i = 0; i < 11; i++) res = await request(app).post('/api/admin/login').send({ email: 'rate-limit@example.test', password: 'wrong' });
  expect(res!.status).toBe(429);
  expect(res!.headers['retry-after']).toBeDefined();
  const read = vi.spyOn(db, 'select');
  expect((await request(app).post('/api/admin/login').send({ email: 'rate-limit@example.test', password: 'wrong' })).status).toBe(429);
  expect(read).not.toHaveBeenCalled();
});
