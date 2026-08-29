import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';

const databaseUrl = process.env.TEST_DATABASE_URL || '';
const safeDatabase = (() => {
  try {
    const parsed = new URL(databaseUrl);
    return ['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname)
      && /(?:test|release|ci)/i.test(parsed.pathname);
  } catch {
    return false;
  }
})();

const integration = safeDatabase ? describe : describe.skip;

integration('executeAtomicBatch (node-postgres)', () => {
  it('rolls back earlier writes when a later query fails', async () => {
    process.env.DATABASE_URL = databaseUrl;
    const [{ db, executeAtomicBatch }, { appSettingsTable }] = await Promise.all([
      import('../../server/db'),
      import('../../server/schema'),
    ]);
    const key = `atomic-batch-test-${randomUUID()}`;

    try {
      await db.insert(appSettingsTable).values({ key, valueJson: { state: 'before' } });

      await expect(executeAtomicBatch((transaction) => [
        transaction.update(appSettingsTable).set({ valueJson: { state: 'changed' } }).where(eq(appSettingsTable.key, key)),
        transaction.insert(appSettingsTable).values({ key, valueJson: { state: 'duplicate' } }),
      ])).rejects.toBeTruthy();

      const [record] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, key)).limit(1);
      expect(record.valueJson).toEqual({ state: 'before' });
    } finally {
      await db.delete(appSettingsTable).where(eq(appSettingsTable.key, key));
    }
  });
});
