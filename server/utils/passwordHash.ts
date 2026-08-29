import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);
const PREFIX = 'scrypt';
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const COST = 16384;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;

type PasswordVerification = {
  valid: boolean;
  needsUpgrade: boolean;
};

const safeEqual = (left: Buffer, right: Buffer): boolean =>
  left.length === right.length && crypto.timingSafeEqual(left, right);

const verifyLegacyPassword = (password: string, stored: string): PasswordVerification => {
  const valid = safeEqual(Buffer.from(password, 'utf8'), Buffer.from(stored, 'utf8'));
  return { valid, needsUpgrade: valid };
};

export const hashPassword = async (password: string): Promise<string> => {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const derivedKey = await scrypt(password, salt, KEY_LENGTH, {
    N: COST,
    r: BLOCK_SIZE,
    p: PARALLELIZATION,
  }) as Buffer;

  return [
    PREFIX,
    COST,
    BLOCK_SIZE,
    PARALLELIZATION,
    salt.toString('base64url'),
    derivedKey.toString('base64url'),
  ].join('$');
};

export const verifyPassword = async (password: string, stored: string): Promise<PasswordVerification> => {
  if (!stored.startsWith(`${PREFIX}$`)) {
    return verifyLegacyPassword(password, stored);
  }

  const parts = stored.split('$');
  if (parts.length !== 6) return verifyLegacyPassword(password, stored);
  const [, costText, blockSizeText, parallelizationText, saltText, hashText] = parts;
  const cost = Number(costText);
  const blockSize = Number(blockSizeText);
  const parallelization = Number(parallelizationText);
  if (cost !== COST || blockSize !== BLOCK_SIZE || parallelization !== PARALLELIZATION || !saltText || !hashText) {
    return verifyLegacyPassword(password, stored);
  }

  try {
    const salt = Buffer.from(saltText, 'base64url');
    const expected = Buffer.from(hashText, 'base64url');
    if (salt.length !== SALT_LENGTH || expected.length !== KEY_LENGTH) return verifyLegacyPassword(password, stored);
    const actual = await scrypt(password, salt, expected.length, {
      N: cost,
      r: blockSize,
      p: parallelization,
    }) as Buffer;
    return { valid: safeEqual(actual, expected), needsUpgrade: false };
  } catch {
    return { valid: false, needsUpgrade: false };
  }
};
