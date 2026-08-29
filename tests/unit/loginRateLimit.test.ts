import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { createLoginRateLimiter } from '../../server/middleware/loginRateLimit';

const createResponse = () => {
  const response = {
    setHeader: vi.fn(),
    status: vi.fn(),
    json: vi.fn(),
  };
  response.status.mockReturnValue(response);
  return response;
};

describe('login rate limiter', () => {
  it('keeps separate limits for different login identities behind the same proxy', () => {
    const limiter = createLoginRateLimiter({ maxAttempts: 1, windowMs: 60_000, now: () => 1_000 });
    const response = createResponse();
    const next = vi.fn() as NextFunction;

    limiter({ ip: '10.0.0.1', body: { email: 'first@example.invalid', role: 'teacher' } } as Request, response as unknown as Response, next);
    limiter({ ip: '10.0.0.1', body: { email: 'second@example.invalid', role: 'teacher' } } as Request, response as unknown as Response, next);

    expect(next).toHaveBeenCalledTimes(2);
    expect(response.status).not.toHaveBeenCalledWith(429);
  });

  it('rejects attempts over the per-client limit and reports retry time', () => {
    let now = 1_000;
    const limiter = createLoginRateLimiter({ maxAttempts: 2, windowMs: 60_000, now: () => now });
    const request = { ip: '203.0.113.10' } as Request;
    const response = createResponse();
    const next = vi.fn() as NextFunction;

    limiter(request, response as unknown as Response, next);
    limiter(request, response as unknown as Response, next);
    limiter(request, response as unknown as Response, next);

    expect(next).toHaveBeenCalledTimes(2);
    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '60');
    expect(response.status).toHaveBeenCalledWith(429);
    expect(response.json).toHaveBeenCalledWith({ error: 'Too many login attempts. Please try again later.' });

    now += 60_001;
    limiter(request, response as unknown as Response, next);
    expect(next).toHaveBeenCalledTimes(3);
  });
});
