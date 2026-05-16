import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

describe('miniprogram/utils/api request', () => {
  beforeEach(() => {
    vi.resetModules();
    (globalThis as any).getApp = () => ({
      globalData: { apiBaseUrl: 'https://api.example.com/api' },
    });
    (globalThis as any).wx = {
      getStorageSync: vi.fn().mockReturnValue('token-123'),
      request: vi.fn(),
    };
  });

  it('attaches auth header and resolves successful responses', async () => {
    const { request } = require('../../miniprogram/utils/api.js');
    (globalThis as any).wx.request.mockImplementation((options: any) => {
      options.success({ statusCode: 200, data: { ok: true } });
    });

    const result = await request({ url: '/profile', method: 'GET' });

    expect(result).toEqual({ ok: true });
    expect((globalThis as any).wx.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://api.example.com/api/profile',
        method: 'GET',
        header: expect.objectContaining({ Authorization: 'Bearer token-123' }),
      })
    );
  });

  it('rejects non-2xx responses with backend payload', async () => {
    const { request } = require('../../miniprogram/utils/api.js');
    (globalThis as any).wx.request.mockImplementation((options: any) => {
      options.success({ statusCode: 403, data: { error: 'Forbidden' } });
    });

    await expect(request({ url: '/admin/pending' })).rejects.toEqual({
      error: 'Forbidden',
      statusCode: 403,
    });
  });

  it('uses default base url and no auth header when app/token missing', async () => {
    vi.resetModules();
    (globalThis as any).getApp = () => ({ globalData: {} });
    (globalThis as any).wx = {
      getStorageSync: vi.fn().mockReturnValue(''),
      request: vi.fn(),
    };
    const { request } = require('../../miniprogram/utils/api.js');

    (globalThis as any).wx.request.mockImplementation((options: any) => {
      options.success({ statusCode: 200, data: { ok: true } });
    });

    await request({ url: '/health' });

    expect((globalThis as any).wx.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: expect.stringMatching(/\/api\/health$/),
        header: expect.not.objectContaining({ Authorization: expect.anything() }),
      })
    );
  });

  it('rejects when underlying wx.request fails', async () => {
    const { request } = require('../../miniprogram/utils/api.js');
    (globalThis as any).wx.request.mockImplementation((options: any) => {
      options.fail({ errMsg: 'timeout' });
    });

    await expect(request({ url: '/profile' })).rejects.toEqual({ errMsg: 'timeout' });
  });
});
