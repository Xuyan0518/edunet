import { Router, type RequestHandler } from 'express';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { teachersTable, parentsTable } from '../schema';
import { generateToken, verifyToken, verifyUserInDb } from '../utils/auth';
import { hashPassword } from './password';

export const webAuthRouter = Router();
const attempts = new Map<string, { count: number; until: number }>();
export const authRateLimit: RequestHandler = (req, res, next) => {
  const now = Date.now();
  for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key);
  const key = req.ip || 'unknown';
  const value = attempts.get(key) || { count: 0, until: now + 15 * 60_000 };
  attempts.set(key, value);
  if (++value.count > 30) { res.set('Retry-After', String(Math.ceil((value.until - now) / 1000))).status(429).json({ error: 'Too many attempts. Try again later.' }); return; }
  next();
};
webAuthRouter.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); res.set('Referrer-Policy', 'no-referrer'); next(); });
webAuthRouter.use(authRateLimit);
const roleSchema = z.enum(['teacher', 'parent']);
const registration = z.object({
  role: roleSchema, name: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email().max(100), password: z.string().min(10).max(128),
});
webAuthRouter.post('/register', async (req, res) => {
  const input = registration.safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: 'Enter a name, valid email, role and password of 10–128 characters.' });
  const { role, name, email, password } = input.data;
  const table = role === 'teacher' ? teachersTable : parentsTable;
  try {
    const existing = await db.select().from(table).where(eq(table.email, email)).limit(1);
    if (existing.length) return res.status(409).json({ error: 'An account with this email already exists. Sign in instead.' });
    await db.insert(table).values({ name, displayName: name, email, password: await hashPassword(password), status: 'pending', authProvider: 'email' });
    return res.status(201).json({ status: 'pending_approval' });
  } catch (error) {
    if ((error as { code?: string }).code === '23505') return res.status(409).json({ error: 'An account with this email already exists.' });
    return res.status(500).json({ error: 'Unable to create account. Try again later.' });
  }
});

type Provider = 'google' | 'wechat';
function config(provider: Provider) {
  const clientId = process.env[provider === 'google' ? 'GOOGLE_CLIENT_ID' : 'WECHAT_WEB_APP_ID'];
  const secret = process.env[provider === 'google' ? 'GOOGLE_CLIENT_SECRET' : 'WECHAT_WEB_APP_SECRET'];
  const api = process.env.API_PUBLIC_URL?.replace(/\/$/, '');
  const frontend = process.env.WEB_APP_URL?.replace(/\/$/, '');
  if (!clientId || !secret || !api || !frontend || !process.env.JWT_SECRET) return null;
  return { clientId, secret, redirect: `${api}/api/auth/web/${provider}/callback`, frontend };
}
webAuthRouter.get('/providers', (_req, res) => res.json({ google: !!config('google'), wechat: !!config('wechat') }));
const cookieOptions = () => ({ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/api/auth/web', maxAge: 10 * 60_000 });
function cookie(req: { headers: { cookie?: string } }, name: string) {
  const value = req.headers.cookie?.split(';').map(v => v.trim()).find(v => v.startsWith(`${name}=`))?.slice(name.length + 1) || '';
  try { return decodeURIComponent(value); } catch { return ''; }
}
function sign(value: string) { return createHmac('sha256', process.env.JWT_SECRET!).update(value).digest('hex'); }
function pack(value: object) { const data = Buffer.from(JSON.stringify(value)).toString('base64url'); return `${data}.${sign(data)}`; }
function unpack(value: string) {
  const [data, signature] = value.split('.');
  if (!data || !signature || signature.length !== 64) throw new Error('Invalid state');
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(sign(data)))) throw new Error('Invalid state');
  return JSON.parse(Buffer.from(data, 'base64url').toString());
}
async function json(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error('Provider request failed');
  const data = await response.json();
  if (data.error || data.errcode) throw new Error('Provider rejected request');
  return data;
}
webAuthRouter.get('/:provider/start', (req, res) => {
  const provider = req.params.provider as Provider;
  if (!['google', 'wechat'].includes(provider)) return res.sendStatus(404);
  const cfg = config(provider), role = roleSchema.safeParse(req.query.role);
  if (!role.success) return res.status(400).json({ error: 'Invalid role' });
  if (!cfg) return res.status(503).json({ error: 'This sign-in provider is not configured.' });
  const nonce = randomBytes(24).toString('hex');
  res.cookie('edunet_oauth', pack({ provider, role: role.data, nonce, expires: Date.now() + 10 * 60_000 }), cookieOptions());
  const url = new URL(provider === 'google' ? 'https://accounts.google.com/o/oauth2/v2/auth' : 'https://open.weixin.qq.com/connect/qrconnect');
  url.search = new URLSearchParams({ [provider === 'google' ? 'client_id' : 'appid']: cfg.clientId, redirect_uri: cfg.redirect, response_type: 'code', scope: provider === 'google' ? 'openid email profile' : 'snsapi_login', state: nonce }).toString();
  if (provider === 'wechat') url.hash = 'wechat_redirect';
  return res.redirect(url.toString());
});
webAuthRouter.get('/:provider/callback', async (req, res) => {
  const provider = req.params.provider as Provider;
  if (!['google', 'wechat'].includes(provider)) return res.sendStatus(404);
  const cfg = config(provider);
  if (!cfg) return res.status(503).json({ error: 'Sign-in is not configured.' });
  const finish = (result: string) => res.redirect(`${cfg.frontend}/web-auth?result=${result}`);
  const saved = cookie(req, 'edunet_oauth');
  res.clearCookie('edunet_oauth', { ...cookieOptions(), maxAge: undefined });
  try {
    const state = unpack(saved);
    if (state.provider !== provider || state.nonce !== req.query.state || state.expires < Date.now() || !roleSchema.safeParse(state.role).success) throw new Error('Invalid state');
    if (req.query.error) return finish('cancelled');
    if (typeof req.query.code !== 'string' || req.query.code.length > 2048) throw new Error('Missing code');
    const table = state.role === 'teacher' ? teachersTable : parentsTable;
    let subject: string, name: string, email: string | null = null, unionId: string | null = null;
    if (provider === 'google') {
      const tokens = await json('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code: req.query.code, client_id: cfg.clientId, client_secret: cfg.secret, redirect_uri: cfg.redirect, grant_type: 'authorization_code' }).toString() });
      if (!tokens.access_token) throw new Error('Missing access token');
      const profile = await json('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${tokens.access_token}` } });
      if (typeof profile.sub !== 'string' || profile.email_verified !== true || typeof profile.email !== 'string') throw new Error('Unverified identity');
      subject = profile.sub; email = profile.email.toLowerCase(); name = profile.name || email;
    } else {
      const tokens = await json(`https://api.weixin.qq.com/sns/oauth2/access_token?${new URLSearchParams({ appid: cfg.clientId, secret: cfg.secret, code: req.query.code, grant_type: 'authorization_code' })}`);
      if (!tokens.openid || !tokens.access_token) throw new Error('Missing identity');
      const profile = await json(`https://api.weixin.qq.com/sns/userinfo?${new URLSearchParams({ access_token: tokens.access_token, openid: tokens.openid, lang: 'zh_CN' })}`);
      if (profile.openid !== tokens.openid) throw new Error('Identity mismatch');
      subject = tokens.openid; unionId = profile.unionid || tokens.unionid || null; name = profile.nickname || 'WeChat user';
    }
    const column = provider === 'google' ? table.googleSubject : table.wechatWebOpenId;
    let [user] = await db.select().from(table).where(eq(column, subject)).limit(1);
    // UnionID is shared across apps under the same WeChat Open Platform account.
    if (!user && unionId) {
      [user] = await db.select().from(table).where(eq(table.wechatUnionId, unionId)).limit(1);
      if (user) await db.update(table).set({ wechatWebOpenId: subject }).where(eq(table.id, user.id));
    }
    if (!user && email) {
      const existing = await db.select().from(table).where(eq(table.email, email)).limit(1);
      // Never implicitly link a password account by matching an email address.
      if (existing.length) return finish('account_exists');
    }
    if (!user) {
      [user] = await db.insert(table).values({ name: String(name).slice(0, 100), displayName: String(name).slice(0, 100), email, password: null, status: 'pending', authProvider: provider, emailVerified: email ? 'true' : 'false', ...(provider === 'google' ? { googleSubject: subject } : { wechatWebOpenId: subject, wechatUnionId: unionId }) }).returning();
    }
    if (user.status !== 'approved') return finish(user.status === 'rejected' ? 'rejected' : 'pending_approval');
    const token = generateToken({ id: user.id, name: user.displayName || user.name, role: state.role });
    res.cookie('edunet_oauth_session', token, { ...cookieOptions(), maxAge: 60_000 });
    return finish('success');
  } catch { return finish('failed'); }
});
webAuthRouter.post('/session', async (req, res) => {
  const origin = process.env.WEB_APP_URL ? new URL(process.env.WEB_APP_URL).origin : '';
  if (!origin || req.headers.origin !== origin) return res.sendStatus(403);
  const token = cookie(req, 'edunet_oauth_session');
  res.clearCookie('edunet_oauth_session', { ...cookieOptions(), maxAge: undefined });
  const user = verifyToken(token);
  if (!user || !(await verifyUserInDb(user))) return res.status(401).json({ error: 'Sign-in expired. Please try again.' });
  return res.json({ user, token });
});
