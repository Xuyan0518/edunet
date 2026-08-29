import type { NextFunction, Request, RequestHandler, Response } from 'express';

type LoginRateLimitOptions = {
  maxAttempts?: number;
  windowMs?: number;
  now?: () => number;
};

type AttemptWindow = {
  count: number;
  resetAt: number;
};

const DEFAULT_MAX_ATTEMPTS = 20;
const DEFAULT_WINDOW_MS = 15 * 60 * 1_000;

export const createLoginRateLimiter = ({
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  windowMs = DEFAULT_WINDOW_MS,
  now = Date.now,
}: LoginRateLimitOptions = {}): RequestHandler => {
  const attempts = new Map<string, AttemptWindow>();
  let requestsSinceSweep = 0;

  return (req: Request, res: Response, next: NextFunction) => {
    const currentTime = now();
    requestsSinceSweep += 1;
    if (requestsSinceSweep >= 100) {
      requestsSinceSweep = 0;
      for (const [key, entry] of attempts) {
        if (entry.resetAt <= currentTime) attempts.delete(key);
      }
    }

    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const role = typeof req.body?.role === 'string' ? req.body.role : 'account';
    const clientAddress = req.ip || req.socket.remoteAddress || 'unknown';
    const key = email ? `${role}:${email}` : clientAddress;
    const existing = attempts.get(key);
    const entry = !existing || existing.resetAt <= currentTime
      ? { count: 0, resetAt: currentTime + windowMs }
      : existing;
    entry.count += 1;
    attempts.set(key, entry);

    if (entry.count > maxAttempts) {
      const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - currentTime) / 1_000));
      res.setHeader('Retry-After', String(retryAfterSeconds));
      res.status(429).json({ error: 'Too many login attempts. Please try again later.' });
      return;
    }

    next();
  };
};
