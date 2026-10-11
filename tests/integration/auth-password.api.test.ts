import request from 'supertest';
import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { createMockDb } from '../helpers/mockDb';
import { hashPassword } from '../../server/auth/password';
const mockDb = createMockDb();
vi.mock('../../server/db', () => ({ db: mockDb }));
let app: Parameters<typeof request>[0];
beforeAll(async () => { ({ app } = await import('../../server/index')); });
beforeEach(() => mockDb.reset());
it('signs in an approved email account using a hash', async () => {
  mockDb.queueSelect([{ id: 'parent', name: 'Parent', status: 'approved', password: await hashPassword('correct-password') }]);
  const res = await request(app).post('/api/login').send({ role: 'parent', email: 'PARENT@example.com', password: 'correct-password' });
  expect(res.status).toBe(200); expect(res.body.token).toBeTruthy(); expect(res.body.user.password).toBeUndefined();
});
it('rejects incorrect passwords without issuing a token', async () => {
  mockDb.queueSelect([{ id: 'parent', status: 'approved', password: await hashPassword('correct-password') }]);
  const res = await request(app).post('/api/login').send({ role: 'parent', email: 'parent@example.com', password: 'wrong' });
  expect(res.status).toBe(401); expect(res.body.token).toBeUndefined();
});
it('keeps pending accounts out of the app', async () => {
  mockDb.queueSelect([{ id: 'parent', status: 'pending', password: await hashPassword('correct-password') }]);
  const res = await request(app).post('/api/login').send({ role: 'parent', email: 'parent@example.com', password: 'correct-password' });
  expect(res.status).toBe(401); expect(res.body.status).toBe('pending_approval'); expect(res.body.token).toBeUndefined();
});
it('upgrades a legacy password after verification', async () => {
  mockDb.queueSelect([{ id: 'parent', status: 'approved', password: 'legacy-password' }]);
  const update = vi.spyOn(mockDb, 'update');
  const res = await request(app).post('/api/login').send({ role: 'parent', email: 'parent@example.com', password: 'legacy-password' });
  expect(res.status).toBe(200); expect(update).toHaveBeenCalledOnce();
});
