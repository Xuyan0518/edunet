import request from 'supertest';
import type { Express } from 'express';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDb } from '../helpers/mockDb';
import { hashPassword, verifyPassword } from '../../server/utils/passwordHash';

const mockDb = createMockDb();
vi.mock('../../server/db', () => ({ db: mockDb }));

let app: Express;
beforeAll(async () => {
  ({ app } = await import('../../server/index'));
});

beforeEach(() => {
  vi.restoreAllMocks();
  mockDb.reset();
});

describe('POST /api/admin/login', () => {
  it('accepts a correctly hashed administrator password', async () => {
    const password = 'A secure administrator password';
    mockDb.queueSelect([{
      id: '4d909122-16a6-442f-a791-f21396ef2160',
      name: 'Secure Administrator',
      displayName: 'Secure Administrator',
      email: 'secure.admin@example.invalid',
      password: await hashPassword(password),
      authProvider: 'password',
    }]);

    const res = await request(app).post('/api/admin/login').send({
      email: 'secure.admin@example.invalid',
      password,
    });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      id: '4d909122-16a6-442f-a791-f21396ef2160',
      role: 'admin',
    });
    expect(res.body.token).toEqual(expect.any(String));
  });

  it('upgrades a valid legacy administrator password to scrypt', async () => {
    const password = 'Legacy administrator password';
    let storedPatch: Record<string, unknown> | undefined;
    vi.spyOn(mockDb, 'update').mockImplementation(() => ({
      set: (patch: Record<string, unknown>) => {
        storedPatch = patch;
        return { where: vi.fn().mockResolvedValue([]) } as never;
      },
    }));
    mockDb.queueSelect([{
      id: 'da3d0965-8d0d-4d6f-bf0b-a38f285709a4',
      name: 'Legacy Administrator',
      email: 'legacy.admin@example.invalid',
      password,
      authProvider: 'reviewer',
    }]);

    const res = await request(app).post('/api/admin/login').send({
      email: 'legacy.admin@example.invalid',
      password,
    });

    expect(res.status).toBe(200);
    expect(storedPatch?.password).toEqual(expect.any(String));
    expect(storedPatch?.password).not.toBe(password);
    expect(await verifyPassword(password, String(storedPatch?.password))).toEqual({
      valid: true,
      needsUpgrade: false,
    });
  });
});
