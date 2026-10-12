import { describe, expect, it, vi } from 'vitest';
import { signingSecret, validateProductionSecurity, reviewerLoginEnabled } from '../../server/utils/securityConfig';
import { logSafeError } from '../../server/utils/safeLog';
import { createAuthRateLimit } from '../../server/middleware/authRateLimit';

describe('production security configuration', () => {
  it.each([undefined, '', ' ', 'short', 'edunet-secret-key-change-in-production', 'example'.repeat(8)])('rejects missing or unsafe signing secrets (%s)', JWT_SECRET => {
    expect(() => signingSecret({ NODE_ENV: 'production', JWT_SECRET })).toThrow();
  });
  it('accepts an explicit strong key and rejects the development launcher', () => {
    const JWT_SECRET = '5c48fd2666b28d7cddfbbdf3a41c036c7bbfa32ec075cbdc';
    expect(signingSecret({ NODE_ENV: 'production', JWT_SECRET })).toBe(JWT_SECRET);
    expect(() => validateProductionSecurity({ NODE_ENV: 'production', JWT_SECRET, EDUNET_DEV_MODE: 'true' })).toThrow();
  });
  it('generates distinct unpredictable keys when development is unconfigured', () => {
    const a = signingSecret({ NODE_ENV: 'development' });
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    expect(a).not.toBe(signingSecret({ NODE_ENV: 'development' }));
  });
  it('requires explicit reviewer opt-in and production credentials', () => {
    expect(reviewerLoginEnabled({ NODE_ENV: 'production' })).toBe(false);
    expect(reviewerLoginEnabled({ REVIEWER_LOGIN_ENABLED: 'false' })).toBe(false);
    expect(reviewerLoginEnabled({ REVIEWER_LOGIN_ENABLED: 'true' })).toBe(true);
    expect(() => validateProductionSecurity({ NODE_ENV: 'production', JWT_SECRET: '8c63a161c4a6740f54b52c02e083ab28', REVIEWER_LOGIN_ENABLED: 'true' })).toThrow();
  });
});

it('logs classifications without exposing SQL, credentials, messages or stacks', () => {
  const output = vi.spyOn(console, 'error').mockImplementation(() => {});
  const privateData = 'PRIVATE-STUDENT SECRET-PASSWORD';
  logSafeError('Daily record write failed', Object.assign(new Error(privateData), { code: '23503', query: privateData, parameters: [privateData] }));
  expect(output).toHaveBeenCalledWith('Daily record write failed', { databaseCode: '23503' });
  logSafeError('Operation failed', { code: privateData, message: privateData });
  expect(JSON.stringify(output.mock.calls)).not.toContain(privateData);
});

it('limits IP and normalized account attempts, resists spoofed forwarding headers, and expires the window', () => {
  let now = 1_800_000_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  const limit = createAuthRateLimit(2, true);
  const res = { set: vi.fn().mockReturnThis(), status: vi.fn().mockReturnThis(), json: vi.fn() };
  const next = vi.fn();
  const attempt = (ip: string, email: string) => limit({ ip, body: { email }, headers: { 'x-forwarded-for': 'spoof' } } as never, res as never, next);
  attempt('1', 'Admin@example.test');
  attempt('2', ' admin@example.test ');
  attempt('3', 'ADMIN@example.test');
  expect(next).toHaveBeenCalledTimes(2);
  expect(res.status).toHaveBeenCalledWith(429);
  expect(res.set).toHaveBeenCalledWith('Retry-After', '900');
  now += 15 * 60_000;
  attempt('3', 'admin@example.test');
  expect(next).toHaveBeenCalledTimes(3);
  attempt('3', 'different@example.test');
  attempt('3', 'another@example.test');
  expect(next).toHaveBeenCalledTimes(4);
});
