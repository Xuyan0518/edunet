import request from 'supertest';
import type { Express } from 'express';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDb } from '../helpers/mockDb';
import { hashPassword } from '../../server/utils/passwordHash';

const mockDb = createMockDb();
vi.mock('../../server/db', () => ({ db: mockDb }));

let app: Express;
beforeAll(async () => {
  ({ app } = await import('../../server/index'));
});

beforeEach(() => {
  mockDb.reset();
});

describe('POST /api/login', () => {
  it('returns generic invalid credentials for an unknown email', async () => {
    mockDb.queueSelect([]);

    const res = await request(app).post('/api/login').send({
      email: 'unknown@example.invalid',
      password: 'not-a-real-password',
      role: 'parent',
    });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid credentials' });
  });

  it('accepts a correctly hashed password for an approved teacher', async () => {
    const password = 'A secure local password';
    mockDb.queueSelect([{
      id: '1962a58d-9bd0-43f8-b802-301350a58a5c',
      name: 'Secure Teacher',
      displayName: 'Secure Teacher',
      email: 'secure.teacher@example.invalid',
      password: await hashPassword(password),
      status: 'approved',
      emailVerified: 'true',
      authProvider: 'password',
    }]);

    const res = await request(app).post('/api/login').send({
      email: 'secure.teacher@example.invalid',
      password,
      role: 'teacher',
    });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      id: '1962a58d-9bd0-43f8-b802-301350a58a5c',
      role: 'teacher',
    });
    expect(res.body.token).toEqual(expect.any(String));
  });

  it('preserves the WeChat-only response for an existing passwordless account', async () => {
    mockDb.queueSelect([{
      id: '3e24165c-e784-4dfa-9ad7-a66025be6fa1',
      name: 'WeChat Teacher',
      email: null,
      password: null,
      status: 'approved',
      authProvider: 'wechat',
    }]);

    const res = await request(app).post('/api/login').send({
      email: 'wechat-placeholder@example.invalid',
      password: 'irrelevant-password',
      role: 'teacher',
    });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'This account uses WeChat login only.' });
  });
});
