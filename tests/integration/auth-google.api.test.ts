import request from 'supertest';
import type { Express } from 'express';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDb } from '../helpers/mockDb';

const mockDb = createMockDb();
const googleMocks = vi.hoisted(() => ({
  verify: vi.fn(),
}));

vi.mock('../../server/db', () => ({ db: mockDb }));
vi.mock('../../server/auth/googleIdentity', () => ({
  GoogleIdentityError: class GoogleIdentityError extends Error {
    constructor(message: string, public code: string) {
      super(message);
    }
  },
  verifyGoogleCredential: googleMocks.verify,
}));

let app: Express;
let generateToken: typeof import('../../server/utils/auth').generateToken;

beforeAll(async () => {
  ({ app } = await import('../../server/index'));
  ({ generateToken } = await import('../../server/utils/auth'));
});

beforeEach(() => {
  mockDb.reset();
  googleMocks.verify.mockReset();
  googleMocks.verify.mockResolvedValue({
    subject: 'google-sub-1',
    email: 'person@example.com',
    name: 'Example Person',
    avatarUrl: 'https://example.com/avatar.png',
  });
});

describe('POST /api/auth/google', () => {
  it('rejects unsupported roles before verifying the credential', async () => {
    const res = await request(app).post('/api/auth/google').send({ credential: 'id-token', role: 'admin' });

    expect(res.status).toBe(400);
    expect(googleMocks.verify).not.toHaveBeenCalled();
  });

  it('creates a pending account and provider identity on first login', async () => {
    mockDb.queueSelect([]); // provider identity lookup
    mockDb.queueSelect([]); // email collision lookup
    mockDb.queueInsert([]); // account insert
    mockDb.queueInsert([]); // identity insert

    const res = await request(app).post('/api/auth/google').send({
      credential: 'id-token',
      role: 'teacher',
    });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('pending_approval');
    expect(res.body.token).toBeUndefined();
    expect(res.body.user).toMatchObject({
      role: 'teacher',
      displayName: 'Example Person',
      email: 'person@example.com',
      authProvider: 'google',
    });
  });

  it('returns an EduNet token for an approved linked account', async () => {
    mockDb.queueSelect([{ id: 'identity-1', accountId: 'teacher-1' }]);
    mockDb.queueSelect([{
      id: 'teacher-1',
      name: 'Example Person',
      displayName: 'Example Person',
      email: 'person@example.com',
      status: 'approved',
      authProvider: 'google',
    }]);
    mockDb.queueUpdate([]);

    const res = await request(app).post('/api/auth/google').send({
      credential: 'id-token',
      role: 'teacher',
    });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTypeOf('string');
    expect(res.body.user).toMatchObject({ id: 'teacher-1', role: 'teacher' });
  });

  it('keeps a returning pending account out of the application', async () => {
    mockDb.queueSelect([{ id: 'identity-1', accountId: 'parent-1' }]);
    mockDb.queueSelect([{
      id: 'parent-1',
      name: 'Example Parent',
      email: 'person@example.com',
      status: 'pending',
      authProvider: 'google',
    }]);
    mockDb.queueUpdate([]);

    const res = await request(app).post('/api/auth/google').send({
      credential: 'id-token',
      role: 'parent',
    });

    expect(res.status).toBe(401);
    expect(res.body.status).toBe('pending_approval');
    expect(res.body.token).toBeUndefined();
  });

  it('does not auto-link an existing account by email', async () => {
    mockDb.queueSelect([]);
    mockDb.queueSelect([{ id: 'teacher-existing', email: 'person@example.com' }]);

    const res = await request(app).post('/api/auth/google').send({
      credential: 'id-token',
      role: 'teacher',
    });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('account_link_required');
  });
});

describe('POST /api/auth/google/link', () => {
  it('rejects replacing an existing Google identity with a different Google account', async () => {
    const token = generateToken({ id: 'teacher-1', role: 'teacher', name: 'Teacher One' });
    mockDb.queueSelect([{ id: 'teacher-1', status: 'approved' }]); // authentication
    mockDb.queueSelect([]); // incoming Google subject is not already linked
    mockDb.queueSelect([{
      id: 'identity-old',
      accountId: 'teacher-1',
      provider: 'google',
      providerSubject: 'google-sub-old',
      email: 'old@example.com',
    }]);

    const res = await request(app)
      .post('/api/auth/google/link')
      .set('Authorization', `Bearer ${token}`)
      .send({ credential: 'id-token' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('google_identity_replacement_requires_unlink');
  });
});
