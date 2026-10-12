import { expect, it } from 'vitest';
import { migrationConnection } from '../../server/utils/migrationConnection';

it('verifies remote migration certificates despite URL SSL overrides', () => {
  const config = migrationConnection('postgresql://test:synthetic@db.example/app?sslmode=no-verify');
  expect(config.ssl).toEqual({ rejectUnauthorized: true });
  expect(config.connectionString).not.toContain('sslmode');
});
it('supports disposable loopback PostgreSQL without TLS', () => {
  expect(migrationConnection('postgresql://test:synthetic@127.0.0.1:55434/app').ssl).toBe(false);
});
