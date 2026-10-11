import { randomBytes, scrypt as derive, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(derive);
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 32) as Buffer;
  return `scrypt$${salt}$${key.toString('hex')}`;
}
export async function verifyPassword(password: string, stored: string) {
  if (!stored.startsWith('scrypt$')) {
    const a = Buffer.from(password), b = Buffer.from(stored);
    return a.length === b.length && timingSafeEqual(a, b);
  }
  const [, salt, digest] = stored.split('$');
  if (!/^[a-f0-9]{32}$/.test(salt || '') || !/^[a-f0-9]{64}$/.test(digest || '')) return false;
  const key = await scrypt(password, salt, 32) as Buffer;
  return timingSafeEqual(key, Buffer.from(digest, 'hex'));
}
