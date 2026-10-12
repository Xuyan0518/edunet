import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../../server/auth/password';
import { randomBytes, scryptSync } from 'node:crypto';
describe('password storage', () => {
  it('salts passwords, verifies matches and rejects incorrect passwords', async () => {
    const a = await hashPassword('correct-password');
    expect(a).not.toBe(await hashPassword('correct-password'));
    expect(a.length).toBeLessThanOrEqual(128);
    expect(await verifyPassword('correct-password', a)).toBe(true);
    expect(await verifyPassword('incorrect', a)).toBe(false);
  });
  it('supports legacy credentials for migration but rejects malformed hashes', async () => {
    expect(await verifyPassword('legacy', 'legacy')).toBe(true);
    expect(await verifyPassword('wrong', 'legacy')).toBe(false);
    expect(await verifyPassword('anything', 'scrypt$invalid')).toBe(false);
    expect(await verifyPassword('legacy', 'legacy', false)).toBe(false);
    const hash = await hashPassword('correct-password');
    expect(await verifyPassword('correct-password', hash, false)).toBe(true);
    expect(await verifyPassword('correct-password', `${hash}$extra`)).toBe(false);
  });
  it('preserves parameterized scrypt credentials and rejects unsafe parameters', async () => {
    const salt = randomBytes(16);
    const digest = scryptSync('original-password', salt, 32).toString('base64url');
    const stored = `scrypt$16384$8$1$${salt.toString('base64url')}$${digest}`;
    expect(await verifyPassword('original-password', stored, false)).toBe(true);
    expect(await verifyPassword('wrong', stored, false)).toBe(false);
    expect(await verifyPassword('original-password', stored.replace('16384', '1073741824'), false)).toBe(false);
  });
});
