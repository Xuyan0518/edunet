import request from 'supertest';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createMockDb } from '../helpers/mockDb';

const mockDb = createMockDb();

vi.mock('../../server/db', () => ({
  db: mockDb,
  executeAtomicBatch: vi.fn(),
}));

let app: typeof import('../../server/index').app;

beforeAll(async () => {
  process.env.REVIEWER_LOGIN_ENABLED = 'false';
  ({ app } = await import('../../server/index'));
});

describe('reviewer login safety', () => {
  it('does not expose reviewer login unless explicitly enabled', async () => {
    const response = await request(app).post('/api/auth/reviewer-login').send({
      username: 'account',
      password: 'xyz2026!!',
    });

    expect(response.status).toBe(404);
  });
});
