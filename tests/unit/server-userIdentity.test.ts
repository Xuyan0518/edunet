import { describe, expect, it } from 'vitest';
import { DEFAULT_USER_NAME, maskOpenId, pickDisplayName, toPublicUser } from '../../server/auth/userIdentity';

describe('server/auth/userIdentity', () => {
  it('trims display name safely', () => {
    expect(pickDisplayName('  Alice  ')).toBe('Alice');
    expect(pickDisplayName('   ')).toBe('');
    expect(pickDisplayName(undefined)).toBe('');
  });

  it('masks openid for display', () => {
    expect(maskOpenId('abcd1234')).toBe('abcd1234');
    expect(maskOpenId('abcdefghijkl')).toBe('abcd***ijkl');
    expect(maskOpenId(null)).toBeNull();
  });

  it('maps db row to public safe user object with fallback name', () => {
    const user = toPublicUser(
      {
        id: 'u1',
        displayName: '',
        name: '',
        avatarUrl: null,
        status: null,
        authProvider: null,
        wechatOpenId: 'abcdefghijklmnop',
        createdAt: null,
        updatedAt: null,
      },
      'teacher'
    );

    expect(user).toEqual({
      id: 'u1',
      role: 'teacher',
      name: DEFAULT_USER_NAME,
      displayName: DEFAULT_USER_NAME,
      avatarUrl: null,
      status: 'approved',
      authProvider: 'wechat',
      wechatOpenIdMasked: 'abcd***mnop',
      canManageStudentsAndParents: false,
      createdAt: null,
      updatedAt: null,
    });
  });
});
