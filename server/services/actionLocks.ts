import { and, eq, gt, lte } from 'drizzle-orm';
import { db } from '../db';
import { actionLocksTable } from '../schema';

export type ActionLockMetadata = Record<string, unknown>;

export type ActionLockOptions = {
  lockKey: string;
  actionType: string;
  actorUserId: string;
  actorName?: string | null;
  ttlMs: number;
  metadata?: ActionLockMetadata;
};

export type ActionLockRow = {
  id: string;
  lockKey: string;
  actionType: string;
  actorUserId: string;
  actorName: string | null;
  metadataJson: unknown;
  acquiredAt: Date;
  expiresAt: Date;
  createdAt: Date | null;
};

export type ActionLockConflict = {
  lockKey: string;
  actionType: string;
  actorUserId: string;
  actorName: string | null;
  expiresAt: Date;
  remainingMs: number;
  metadata: unknown;
};

export class ActionLockConflictError extends Error {
  conflict: ActionLockConflict;

  constructor(conflict: ActionLockConflict) {
    super('Action is currently locked');
    this.name = 'ActionLockConflictError';
    this.conflict = conflict;
  }
}

const nowDate = () => new Date();

const toConflict = (row: ActionLockRow): ActionLockConflict => {
  const now = Date.now();
  const expiresAtMs = new Date(row.expiresAt).getTime();
  return {
    lockKey: row.lockKey,
    actionType: row.actionType,
    actorUserId: row.actorUserId,
    actorName: row.actorName,
    expiresAt: new Date(row.expiresAt),
    remainingMs: Math.max(0, expiresAtMs - now),
    metadata: row.metadataJson,
  };
};

const parsePgLikeErrorCode = (err: unknown) => {
  if (!err || typeof err !== 'object') return '';
  const maybe = err as { code?: string; cause?: { code?: string } };
  return maybe.code || maybe.cause?.code || '';
};

export const isActionLockConflictError = (err: unknown): err is ActionLockConflictError =>
  err instanceof ActionLockConflictError;

export const buildActionLockConflictPayload = (conflict: ActionLockConflict) => ({
  error: 'ACTION_LOCKED',
  message: conflict.actorName
    ? `当前${conflict.actorName}正在进行${conflict.actionType}，请稍后再试。`
    : `当前有老师正在进行${conflict.actionType}，请稍后再试。`,
  lock: {
    lockKey: conflict.lockKey,
    actionType: conflict.actionType,
    actorName: conflict.actorName || '另一位老师',
    expiresAt: conflict.expiresAt.toISOString(),
    remainingMs: conflict.remainingMs,
  },
});

export async function acquireActionLock(options: ActionLockOptions): Promise<ActionLockRow> {
  const { lockKey, actionType, actorUserId, actorName, ttlMs, metadata } = options;
  const now = nowDate();
  const expiresAt = new Date(now.getTime() + Math.max(1000, ttlMs));

  // Best-effort cleanup for this key only; avoids global scans.
  await db
    .delete(actionLocksTable)
    .where(and(eq(actionLocksTable.lockKey, lockKey), lte(actionLocksTable.expiresAt, now)));

  try {
    const inserted = await db
      .insert(actionLocksTable)
      .values({
        lockKey,
        actionType,
        actorUserId,
        actorName: actorName || null,
        metadataJson: metadata ?? null,
        acquiredAt: now,
        expiresAt,
      })
      .returning();

    return inserted[0] as ActionLockRow;
  } catch (err) {
    const code = parsePgLikeErrorCode(err);
    // 23505: unique violation (postgres)
    if (code === '23505' || String(err).toLowerCase().includes('unique')) {
      const existing = await db
        .select()
        .from(actionLocksTable)
        .where(and(eq(actionLocksTable.lockKey, lockKey), gt(actionLocksTable.expiresAt, now)))
        .limit(1);
      if (existing.length) {
        throw new ActionLockConflictError(toConflict(existing[0] as ActionLockRow));
      }

      // Race where lock expired/removed between insert fail and read; retry once.
      const retry = await db
        .insert(actionLocksTable)
        .values({
          lockKey,
          actionType,
          actorUserId,
          actorName: actorName || null,
          metadataJson: metadata ?? null,
          acquiredAt: nowDate(),
          expiresAt: new Date(Date.now() + Math.max(1000, ttlMs)),
        })
        .returning();
      return retry[0] as ActionLockRow;
    }
    throw err;
  }
}

export async function releaseActionLock(lockId: string, actorUserId?: string): Promise<void> {
  if (!lockId) return;
  if (actorUserId) {
    await db
      .delete(actionLocksTable)
      .where(and(eq(actionLocksTable.id, lockId), eq(actionLocksTable.actorUserId, actorUserId)));
    return;
  }
  await db.delete(actionLocksTable).where(eq(actionLocksTable.id, lockId));
}

export async function withActionLock<T>(
  options: ActionLockOptions,
  callback: () => Promise<T>,
): Promise<T> {
  const lock = await acquireActionLock(options);
  try {
    return await callback();
  } finally {
    try {
      await releaseActionLock(lock.id, options.actorUserId);
    } catch (err) {
      console.warn('[action-lock] failed to release lock', {
        lockId: lock.id,
        lockKey: lock.lockKey,
        actorUserId: options.actorUserId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
