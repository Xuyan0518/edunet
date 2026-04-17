import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDb } from '../helpers/mockDb';

const mockDb = createMockDb();

vi.mock('../../server/db', () => ({
  db: mockDb,
}));

let generateToken: typeof import('../../server/utils/auth').generateToken;
let verifyToken: typeof import('../../server/utils/auth').verifyToken;
let verifyUserInDb: typeof import('../../server/utils/auth').verifyUserInDb;

beforeAll(async () => {
  const mod = await import('../../server/utils/auth');
  generateToken = mod.generateToken;
  verifyToken = mod.verifyToken;
  verifyUserInDb = mod.verifyUserInDb;
});

beforeEach(() => {
  mockDb.reset();
  vi.restoreAllMocks();
});

describe('server/utils/auth token logic', () => {
  it('generates and verifies token', () => {
    const token = generateToken({ id: 't-1', role: 'teacher', name: 'Alice' });
    const parsed = verifyToken(token);
    expect(parsed).toMatchObject({ id: 't-1', role: 'teacher', name: 'Alice' });
  });

  it('rejects tampered token', () => {
    const token = generateToken({ id: 'p-1', role: 'parent', name: 'Bob' });
    const tampered = `${token}xx`;
    expect(verifyToken(tampered)).toBeNull();
  });

  it('rejects expired token', () => {
    const nowSpy = vi.spyOn(Date, 'now');
    nowSpy.mockReturnValue(1_700_000_000_000);
    const token = generateToken({ id: 'a-1', role: 'admin', name: 'Admin' });
    nowSpy.mockReturnValue(1_700_000_000_000 + 8 * 24 * 60 * 60 * 1000);
    expect(verifyToken(token)).toBeNull();
  });

  it('rejects malformed token payloads', () => {
    expect(verifyToken('not-a-token')).toBeNull();

    const signature = 'abc123';
    const malformedPayload = Buffer.from('{bad json').toString('base64');
    expect(verifyToken(`${malformedPayload}.${signature}`)).toBeNull();
  });
});

describe('server/utils/auth verifyUserInDb', () => {
  it('accepts approved teacher', async () => {
    mockDb.queueSelect([{ id: 't-1', status: 'approved' }]);
    await expect(verifyUserInDb({ id: 't-1', role: 'teacher', name: 'Alice' })).resolves.toBe(true);
  });

  it('rejects pending parent', async () => {
    mockDb.queueSelect([{ id: 'p-1', status: 'pending' }]);
    await expect(verifyUserInDb({ id: 'p-1', role: 'parent', name: 'Parent' })).resolves.toBe(false);
  });

  it('accepts existing admin', async () => {
    mockDb.queueSelect([{ id: 'a-1' }]);
    await expect(verifyUserInDb({ id: 'a-1', role: 'admin', name: 'Admin' })).resolves.toBe(true);
  });

  it('rejects missing account', async () => {
    mockDb.queueSelect([]);
    await expect(verifyUserInDb({ id: 'missing', role: 'teacher', name: 'n/a' })).resolves.toBe(false);
  });

  it('returns false for unknown role values', async () => {
    await expect(
      verifyUserInDb({ id: 'x-1', role: 'ghost' as any, name: 'Unknown', displayName: 'Unknown' } as any)
    ).resolves.toBe(false);
  });

  it('returns false when db lookup throws', async () => {
    vi.spyOn(mockDb, 'select').mockImplementationOnce(() => {
      throw new Error('db unavailable');
    });

    await expect(verifyUserInDb({ id: 'x-2', role: 'teacher', name: 'Teacher' })).resolves.toBe(false);
  });
});
