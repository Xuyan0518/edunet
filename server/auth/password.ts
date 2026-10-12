import { randomBytes, scrypt as derive, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(derive);
export const ADMIN_PASSWORD_HASH_PATTERN = '^(scrypt[$][a-f0-9]{32}[$][a-f0-9]{64}|scrypt[$]16384[$]8[$]1[$][A-Za-z0-9_-]{22}[$][A-Za-z0-9_-]{43})$';
export function isPasswordHash(stored: string): boolean {
  return new RegExp(ADMIN_PASSWORD_HASH_PATTERN).test(stored);
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 32) as Buffer;
  return `scrypt$${salt}$${key.toString('hex')}`;
}
export async function verifyPassword(password: string, stored: string, allowLegacy = true) {
  if (!stored.startsWith('scrypt$')) {
    if (!allowLegacy) return false;
    const a = Buffer.from(password), b = Buffer.from(stored);
    return a.length === b.length && timingSafeEqual(a, b);
  }
  // Preserve the earlier parameterized scrypt format. Fixed cost parameters
  // prevent malformed stored hashes from requesting unbounded work.
  const parts = stored.split('$');
  if (parts.length === 6) {
    if (!isPasswordHash(stored)) return false;
    const salt = Buffer.from(parts[4], 'base64url');
    const digest = Buffer.from(parts[5], 'base64url');
    if (salt.length !== 16 || digest.length !== 32 || salt.toString('base64url') !== parts[4] || digest.toString('base64url') !== parts[5]) return false;
    // Node's default scrypt cost is N=16384, r=8, p=1, as validated above.
    const key = await scrypt(password, salt, 32) as Buffer;
    return timingSafeEqual(key, digest);
  }
  const [format, salt, digest, extra] = stored.split('$');
  if (format !== 'scrypt' || extra !== undefined) return false;
  if (!/^[a-f0-9]{32}$/.test(salt || '') || !/^[a-f0-9]{64}$/.test(digest || '')) return false;
  const key = await scrypt(password, salt, 32) as Buffer;
  return timingSafeEqual(key, Buffer.from(digest, 'hex'));
}
