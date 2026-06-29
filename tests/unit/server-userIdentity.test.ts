import { describe, expect, it } from 'vitest';
import { DEFAULT_USER_NAME, maskOpenId, pickDisplayName, toPublicUser } from '../../server/auth/userIdentity';
import { canManageStudentsAndParents } from '../../server/utils/managementPermissions';

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

  it('allows configured teacher openids and admins to manage students and parents', () => {
    expect(canManageStudentsAndParents({ role: 'teacher', wechatOpenId: 'o-zVF3carqsMGxDM0OhAVBc0stcI' })).toBe(true);
    expect(canManageStudentsAndParents({ role: 'teacher', wechatOpenId: 'o-zVF3YX1px9ZOZGXJ4BCwXItoDY' })).toBe(true);
    expect(canManageStudentsAndParents({ role: 'teacher', wechatOpenId: 'o-zVF3RHZoOXq_TLMUhWTqDb1xHw' })).toBe(true);
    expect(canManageStudentsAndParents({ role: 'teacher', wechatOpenId: 'other-openid' })).toBe(false);
    expect(canManageStudentsAndParents({ role: 'admin', wechatOpenId: 'other-openid' })).toBe(true);
  });
});
