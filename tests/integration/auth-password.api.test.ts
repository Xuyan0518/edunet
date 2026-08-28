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
});
