import { beforeEach, describe, expect, it, vi } from 'vitest';

type MockDbBundle = {
  db: {
    delete: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
    select: ReturnType<typeof vi.fn>;
  };
  deleteWhere: ReturnType<typeof vi.fn>;
  insertReturning: ReturnType<typeof vi.fn>;
  selectLimit: ReturnType<typeof vi.fn>;
};

const tableMock = {
  id: 'id',
  lockKey: 'lock_key',
  actionType: 'action_type',
  actorUserId: 'actor_user_id',
  actorName: 'actor_name',
  metadataJson: 'metadata_json',
  acquiredAt: 'acquired_at',
  expiresAt: 'expires_at',
  createdAt: 'created_at',
};

const createDbMocks = (): MockDbBundle => {
  const deleteWhere = vi.fn(async () => undefined);
  const insertReturning = vi.fn(async () => []);
  const selectLimit = vi.fn(async () => []);

  const db = {
    delete: vi.fn(() => ({ where: deleteWhere })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: insertReturning,
      })),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: selectLimit,
        })),
      })),
    })),
  };

  return { db, deleteWhere, insertReturning, selectLimit };
};

const loadModule = async (mocks: MockDbBundle) => {
  vi.doMock('../../server/db', () => ({ db: mocks.db }));
  vi.doMock('../../server/schema', () => ({ actionLocksTable: tableMock }));
  return import('../../server/services/actionLocks');
};

describe('actionLocks service', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('acquires lock successfully', async () => {
    const mocks = createDbMocks();
    mocks.insertReturning.mockResolvedValueOnce([
      {
        id: 'lock-1',
        lockKey: 'student:s1:write',
        actionType: '更新',
        actorUserId: 'u1',
        actorName: '老师A',
        metadataJson: null,
        acquiredAt: new Date(),
        expiresAt: new Date(Date.now() + 60000),
        createdAt: new Date(),
      },
    ]);
    const mod = await loadModule(mocks);

    const lock = await mod.acquireActionLock({
      lockKey: 'student:s1:write',
      actionType: '更新',
      actorUserId: 'u1',
      actorName: '老师A',
      ttlMs: 60_000,
    });

    expect(lock.id).toBe('lock-1');
    expect(mocks.insertReturning).toHaveBeenCalledTimes(1);
  });

  it('returns conflict when same key is locked and not expired', async () => {
    const mocks = createDbMocks();
    mocks.insertReturning.mockRejectedValueOnce({ code: '23505' });
    mocks.selectLimit.mockResolvedValueOnce([
      {
        id: 'lock-existing',
        lockKey: 'student:s1:write',
        actionType: '保存报告',
        actorUserId: 'u2',
        actorName: '陈老师',
        metadataJson: { route: '/api/reports' },
        acquiredAt: new Date(),
        expiresAt: new Date(Date.now() + 50_000),
        createdAt: new Date(),
      },
    ]);
    const mod = await loadModule(mocks);

    await expect(
      mod.acquireActionLock({
        lockKey: 'student:s1:write',
        actionType: '保存报告',
        actorUserId: 'u1',
        ttlMs: 60_000,
      }),
    ).rejects.toBeInstanceOf(mod.ActionLockConflictError);
  });

  it('retries once when unique conflict happened but no active lock exists', async () => {
    const mocks = createDbMocks();
    mocks.insertReturning
      .mockRejectedValueOnce({ code: '23505' })
      .mockResolvedValueOnce([
        {
          id: 'lock-2',
          lockKey: 'student:s1:write',
          actionType: '更新',
          actorUserId: 'u1',
          actorName: null,
          metadataJson: null,
          acquiredAt: new Date(),
          expiresAt: new Date(Date.now() + 60_000),
          createdAt: new Date(),
        },
      ]);
    mocks.selectLimit.mockResolvedValueOnce([]);
    const mod = await loadModule(mocks);

    const lock = await mod.acquireActionLock({
      lockKey: 'student:s1:write',
      actionType: '更新',
      actorUserId: 'u1',
      ttlMs: 60_000,
    });

    expect(lock.id).toBe('lock-2');
    expect(mocks.insertReturning).toHaveBeenCalledTimes(2);
  });

  it('releases lock with actor guard', async () => {
    const mocks = createDbMocks();
    const mod = await loadModule(mocks);

    await mod.releaseActionLock('lock-1', 'u1');
    expect(mocks.db.delete).toHaveBeenCalledTimes(1);
    expect(mocks.deleteWhere).toHaveBeenCalledTimes(1);
  });

  it('withActionLock releases lock on success', async () => {
    const mocks = createDbMocks();
    mocks.insertReturning.mockResolvedValueOnce([
      {
        id: 'lock-3',
        lockKey: 'student:s1:write',
        actionType: '更新',
        actorUserId: 'u1',
        actorName: null,
        metadataJson: null,
        acquiredAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
        createdAt: new Date(),
      },
    ]);
    const mod = await loadModule(mocks);

    const result = await mod.withActionLock(
      {
        lockKey: 'student:s1:write',
        actionType: '更新',
        actorUserId: 'u1',
        ttlMs: 60_000,
      },
      async () => 'ok',
    );

    expect(result).toBe('ok');
    // cleanup delete + release delete
    expect(mocks.db.delete).toHaveBeenCalledTimes(2);
  });

  it('withActionLock releases lock when callback throws', async () => {
    const mocks = createDbMocks();
    mocks.insertReturning.mockResolvedValueOnce([
      {
        id: 'lock-4',
        lockKey: 'student:s1:write',
        actionType: '更新',
        actorUserId: 'u1',
        actorName: null,
        metadataJson: null,
        acquiredAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
        createdAt: new Date(),
      },
    ]);
    const mod = await loadModule(mocks);

    await expect(
      mod.withActionLock(
        {
          lockKey: 'student:s1:write',
          actionType: '更新',
          actorUserId: 'u1',
          ttlMs: 60_000,
        },
        async () => {
          throw new Error('boom');
        },
      ),
    ).rejects.toThrow('boom');

    expect(mocks.db.delete).toHaveBeenCalledTimes(2);
  });
});
