import { describe, expect, it } from 'vitest';
import { hasStoredToken, parseStoredUser } from '../../src/utils/authSession';

describe('auth session restoration', () => {
  it('does not restore a user when the bearer token is missing', () => {
    expect(parseStoredUser('{"id":"teacher-1","role":"teacher"}', null)).toBeNull();
  });

  it('does not restore malformed user data', () => {
    expect(parseStoredUser('{invalid', 'token-1')).toBeNull();
  });

  it('restores a valid user only when a token is present', () => {
    expect(parseStoredUser<{ id: string; role: string }>('{"id":"teacher-1","role":"teacher"}', 'token-1')).toEqual({
      id: 'teacher-1',
      role: 'teacher',
    });
  });

  it('recognizes either shared or legacy admin tokens', () => {
    expect(hasStoredToken(null, null)).toBe(false);
    expect(hasStoredToken('shared-token', null)).toBe(true);
    expect(hasStoredToken(null, 'admin-token')).toBe(true);
  });
});
