import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  DEFAULT_USER_NAME,
  DEFAULT_IDENTITY_HINT,
  resolveDisplayName,
  resolveIdentityHint,
} = require('../../miniprogram/utils/userIdentity.js');

describe('miniprogram user identity helpers', () => {
  it('resolves display name with fallback priority', () => {
    expect(resolveDisplayName({ displayName: 'Teacher A', name: 'Old Name' })).toBe('Teacher A');
    expect(resolveDisplayName({ displayName: '   ', name: 'Legacy Name' })).toBe('Legacy Name');
    expect(resolveDisplayName({})).toBe(DEFAULT_USER_NAME);
  });

  it('resolves identity hint with fallback', () => {
    expect(resolveIdentityHint({ wechatOpenIdMasked: 'wx_***_1234' })).toBe('wx_***_1234');
    expect(resolveIdentityHint({ wechatOpenIdMasked: '  ' })).toBe(DEFAULT_IDENTITY_HINT);
  });
});
