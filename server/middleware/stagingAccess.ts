import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';

const cookieName = '__Host-edunet-staging';
const lifetimeSeconds = 8 * 60 * 60;
const digest = (value: string) => createHash('sha256').update(value).digest();
const equal = (a: string, b: string) => timingSafeEqual(digest(a), digest(b));

// This gate surrounds both the SPA and API. A signed cookie keeps the gate separate
// from the application's Bearer authorization header after the initial Basic login.
export function createStagingAccess(env = process.env): RequestHandler {
  if (env.DEPLOYMENT_ENV !== 'staging') return (_req, _res, next) => next();
  const username = env.STAGING_ACCESS_USERNAME?.trim();
  const password = env.STAGING_ACCESS_PASSWORD;
  if (!username || username.includes(':') || !password || password.length < 24) {
    throw new Error('Private staging requires STAGING_ACCESS_USERNAME and a password of at least 24 characters.');
  }
  const credentials = `${username}:${password}`;
  const key = digest(`edunet-staging-cookie:${credentials}`);
  const signature = (expiry: string) => createHmac('sha256', key).update(`v1.${expiry}`).digest('hex');
  return (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
    if (['GET', 'HEAD'].includes(req.method) && ['/api/health', '/api/ready'].includes(req.path)) { next(); return; }
    const cookie = (req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
    if (cookie) {
      const [version, expiry, mac] = cookie.split('.');
      const now = Math.floor(Date.now() / 1000);
      if (version === 'v1' && /^\d{10}$/.test(expiry || '') && Number(expiry) > now && Number(expiry) <= now + lifetimeSeconds && equal(mac || '', signature(expiry))) {
        next(); return;
      }
    }
    const authorization = req.headers.authorization || '';
    if (authorization.length < 2048 && /^Basic /i.test(authorization) && equal(Buffer.from(authorization.slice(6), 'base64').toString('utf8'), credentials)) {
      const expiry = String(Math.floor(Date.now() / 1000) + lifetimeSeconds);
      res.cookie(cookieName, `v1.${expiry}.${signature(expiry)}`, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: lifetimeSeconds * 1000 });
      next(); return;
    }
    res.set('WWW-Authenticate', 'Basic realm="EduNet private staging", charset="UTF-8"');
    res.status(401).send('Private staging access required.');
  };
}
