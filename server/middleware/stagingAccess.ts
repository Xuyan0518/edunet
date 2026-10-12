import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { urlencoded, type RequestHandler } from 'express';
import { createAuthRateLimit } from './authRateLimit';

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
  const parseForm = urlencoded({ extended: false, limit: '2kb' });
  const rateLimit = createAuthRateLimit(10);
  const accessForm = (error = false) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EduNet private staging</title><style>body{font:16px system-ui;background:#f5f7fb;color:#18233b;margin:0;padding:3rem 1rem}main{max-width:400px;margin:auto;background:white;padding:2rem;border-radius:16px}label{display:block;margin-top:1rem}input,button{box-sizing:border-box;width:100%;padding:.8rem;font:inherit;margin-top:.4rem}button{background:#173878;color:white;border:0;border-radius:8px;margin-top:1.5rem}</style></head><body><main><h1>EduNet private staging</h1><p>Enter your staging access credentials to open the test app.</p>${error ? '<p role="alert">Access denied. Check your staging credentials.</p>' : ''}<form method="post" action="/__staging/login"><label>Access username<input name="username" autocomplete="username" maxlength="256" required></label><label>Access password<input name="password" type="password" autocomplete="current-password" maxlength="256" required></label><button type="submit">Open staging</button></form></main></body></html>`;
  const setAccessCookie: RequestHandler = (_req, res, next) => {
    const expiry = String(Math.floor(Date.now() / 1000) + lifetimeSeconds);
    res.cookie(cookieName, `v1.${expiry}.${signature(expiry)}`, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: lifetimeSeconds * 1000 });
    next();
  };
  return (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
    if (req.method === 'POST' && req.path === '/__staging/login') {
      if (!env.WEB_APP_URL || req.headers.origin !== new URL(env.WEB_APP_URL).origin) { res.sendStatus(403); return; }
      rateLimit(req, res, () => parseForm(req, res, error => {
        if (error) { res.sendStatus(400); return; }
        if (typeof req.body?.username !== 'string' || typeof req.body?.password !== 'string' || !equal(`${req.body.username}:${req.body.password}`, credentials)) {
          res.status(401).type('html').send(accessForm(true)); return;
        }
        setAccessCookie(req, res, () => res.redirect(303, '/login'));
      }));
      return;
    }
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
      setAccessCookie(req, res, next); return;
    }
    if (req.method === 'GET' && req.accepts('html') && !req.path.startsWith('/api') && !req.path.startsWith('/assets/')) {
      res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
      // A public access form contains no application data. Some embedded browsers
      // reject every 401 document before rendering it, even without a challenge.
      res.status(200).type('html').send(accessForm()); return;
    }
    res.set('WWW-Authenticate', 'Basic realm="EduNet private staging", charset="UTF-8"');
    res.status(401).send('Private staging access required.');
  };
}
