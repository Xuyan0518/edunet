import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

describe('miniprogram action lock helper', () => {
  beforeEach(() => {
    vi.resetModules();
    (globalThis as any).wx = {
      showToast: vi.fn(),
    };
  });

  it('detects ACTION_LOCKED payload and shows friendly message', () => {
    const { isActionLockError, buildActionLockMessage, showActionLockToast } = require('../../miniprogram/utils/actionLock.js');
    const err = {
      error: 'ACTION_LOCKED',
      message: '当前陈老师正在进行保存学习报告，请稍后再试。',
      lock: { remainingMs: 5200 },
    };

    expect(isActionLockError(err)).toBe(true);
    expect(buildActionLockMessage(err)).toContain('预计 6 秒后可重试');
    expect(showActionLockToast(err)).toBe(true);
    expect((globalThis as any).wx.showToast).toHaveBeenCalled();
  });

  it('returns false for non-lock errors', () => {
    const { isActionLockError, showActionLockToast } = require('../../miniprogram/utils/actionLock.js');
    const err = { error: 'Database error' };
    expect(isActionLockError(err)).toBe(false);
    expect(showActionLockToast(err)).toBe(false);
    expect((globalThis as any).wx.showToast).not.toHaveBeenCalled();
  });
});
