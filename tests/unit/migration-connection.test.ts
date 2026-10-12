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
it('uses the direct Neon endpoint for session migration locks', () => {
  const config = migrationConnection('postgresql://test:synthetic@ep-test-pooler.c-4.ap-southeast-1.aws.neon.tech/app?sslmode=require');
  expect(new URL(config.connectionString).hostname).toBe('ep-test.c-4.ap-southeast-1.aws.neon.tech');
  expect(config.ssl).toEqual({ rejectUnauthorized: true });
  expect(new URL(config.connectionString).password).toBe('synthetic');
});
it('preserves non-Neon hostnames that contain pooler', () => {
  const config = migrationConnection('postgresql://test:synthetic@db-pooler.example/app');
  expect(new URL(config.connectionString).hostname).toBe('db-pooler.example');
});
