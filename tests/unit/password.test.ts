import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../../server/auth/password';
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
  });
});
