import { describe, expect, it } from 'vitest';
import { databaseSslConfig } from '../../server/utils/databaseSsl';

describe('databaseSslConfig', () => {
  it.each([
    'postgresql://user@127.0.0.1:55432/db',
    'postgresql://user@localhost:5432/db',
    'postgresql://user@[::1]:5432/db',
  ])('disables SSL for an isolated local PostgreSQL server: %s', (databaseUrl) => {
    expect(databaseSslConfig(databaseUrl)).toBe(false);
  });

  it('validates hosted PostgreSQL certificates by default', () => {
    expect(databaseSslConfig('postgresql://user:***@dpg-example.render.com/db')).toEqual({
      rejectUnauthorized: true,
    });
  });

  it('honors an explicit sslmode=disable for trusted non-TLS networks', () => {
    expect(databaseSslConfig('postgresql://user@postgres:5432/db?sslmode=disable')).toBe(false);
  });

  it('requires an explicit opt-out before accepting an unverified hosted certificate', () => {
    expect(databaseSslConfig('postgresql://user@dpg-example.render.com/db', false)).toEqual({
      rejectUnauthorized: false,
    });
  });

  it('allows an explicit non-TLS override for a private-network database URL', () => {
    expect(databaseSslConfig(
      'postgresql://user@dpg-private-a/db',
      true,
      'disable',
    )).toBe(false);
  });

  it('fails closed when the database URL is malformed', () => {
    expect(() => databaseSslConfig('not-a-url')).toThrow('Invalid DATABASE_URL');
  });
});
