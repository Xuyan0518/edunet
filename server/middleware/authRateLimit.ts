import type { RequestHandler } from 'express';

export function createAuthRateLimit(limit = 30, perAccount = false): RequestHandler {
  const attempts = new Map<string, { count: number; until: number }>();
  return (req, res, next) => {
    const now = Date.now();
    for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key);
    const keys = [`ip:${req.ip || 'unknown'}`];
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase().slice(0, 100) : '';
    if (perAccount && email) keys.push(`account:${email}`);
    let retryAfter = 0;
    for (const key of keys) {
      if (!attempts.has(key) && attempts.size >= 10_000) {
        retryAfter = Math.max(retryAfter, 900);
        continue;
      }
      const value = attempts.get(key) || { count: 0, until: now + 15 * 60_000 };
      attempts.set(key, value);
      if (++value.count > limit) retryAfter = Math.max(retryAfter, Math.ceil((value.until - now) / 1000));
    }
    res.set('Cache-Control', 'no-store');
    if (retryAfter) {
      res.set('Retry-After', String(retryAfter)).status(429).json({ error: 'Too many attempts. Try again later.' });
      return;
    }
    next();
  };
}

export const authRateLimit = createAuthRateLimit();
export const adminAuthRateLimit = createAuthRateLimit(10, true);
