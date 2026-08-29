import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../../server/utils/passwordHash';

describe('password hashing', () => {
  it('stores a one-way scrypt hash that verifies only the correct password', async () => {
    const password = 'Correct horse battery staple!';

    const stored = await hashPassword(password);

    expect(stored).not.toBe(password);
    expect(stored.startsWith('scrypt$')).toBe(true);
    expect(stored.length).toBeLessThanOrEqual(100);
    await expect(verifyPassword(password, stored)).resolves.toEqual({ valid: true, needsUpgrade: false });
    await expect(verifyPassword('wrong password', stored)).resolves.toEqual({ valid: false, needsUpgrade: false });
  });

  it('recognizes a valid legacy plaintext password for transparent upgrade', async () => {
    await expect(verifyPassword('legacy-secret', 'legacy-secret')).resolves.toEqual({ valid: true, needsUpgrade: true });
    await expect(verifyPassword('wrong', 'legacy-secret')).resolves.toEqual({ valid: false, needsUpgrade: false });
  });

  it('treats a malformed scrypt-prefixed legacy value as plaintext for one-time upgrade', async () => {
    await expect(verifyPassword('scrypt$broken', 'scrypt$broken')).resolves.toEqual({ valid: true, needsUpgrade: true });
    await expect(verifyPassword('anything', 'scrypt$broken')).resolves.toEqual({ valid: false, needsUpgrade: false });
  });
});
