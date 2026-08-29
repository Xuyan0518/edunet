import request from 'supertest';
import type { Express } from 'express';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDb } from '../helpers/mockDb';

const mockDb = createMockDb();
vi.mock('../../server/db', () => ({ db: mockDb }));

let app: Express;
beforeAll(async () => {
  ({ app } = await import('../../server/index'));
});

beforeEach(() => {
  mockDb.reset();
});

describe('password login rate limiting', () => {
  it('limits repeated web-login attempts from one client', async () => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      mockDb.queueSelect([]);
      const res = await request(app).post('/api/login').send({
        email: 'unknown@example.invalid',
        password: 'not-a-real-password',
        role: 'teacher',
      });
      expect(res.status).toBe(401);
    }

    const blocked = await request(app).post('/api/login').send({
      email: 'unknown@example.invalid',
      password: 'not-a-real-password',
      role: 'teacher',
    });

    expect(blocked.status).toBe(429);
    expect(blocked.headers['retry-after']).toEqual(expect.any(String));
    expect(blocked.body).toEqual({ error: 'Too many login attempts. Please try again later.' });
  });
});
