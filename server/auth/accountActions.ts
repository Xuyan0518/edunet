import { Router, type RequestHandler } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import { sql, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { accountRoleSchema, roleTable, type AccountRole } from '../services/accountManagement';
import { authMailReady, authWebsite, encryptAuthMail, queuePasswordNotice } from '../services/authMail';
import { hashPassword, verifyPassword } from './password';
import { createAuthRateLimit } from '../middleware/authRateLimit';
import { logSafeError } from '../utils/safeLog';

export const accountActionsRouter = Router();
const requestSchema = z.object({ role: accountRoleSchema, email: z.string().trim().toLowerCase().email().max(100) });
const newPassword = z.string().min(10).max(128);
const resetSchema = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/), password: newPassword, confirmation: newPassword }).refine(v => v.password === v.confirmation);
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
const requestLimit = createAuthRateLimit(5, true);
export async function queueAccountAction(role: AccountRole, email: string, purpose: 'reset' | 'verify'): Promise<void> {
  const table = roleTable(role), token = randomBytes(32).toString('hex'), tokenHash = digest(token);
  const website = authWebsite();
  if (!website.pathname.endsWith('/')) website.pathname += '/';
  const url = new URL(purpose === 'reset' ? 'reset-password' : 'verify-email', website);
  url.searchParams.set('role', role);
  url.hash = token;
  const minutes = purpose === 'reset' ? 30 : 1440;
  const mail = encryptAuthMail({ to: email, subject: purpose === 'reset' ? 'Reset your EduNet password / 重设密码' : 'Verify your EduNet email / 验证邮箱', text: `${purpose === 'reset' ? 'Reset your password within 30 minutes. / 请在30分钟内重设密码。' : 'Verify your email within 24 hours. Administrator approval is still required. / 请在24小时内验证邮箱，账号仍需管理员审核。'}\n\n${url.toString()}\n\nIf you did not request this, ignore this email. / 如非本人申请，请忽略此邮件。` });
  // Every request executes the same query and returns the same response. Only
  // qualifying accounts create work; delivery happens in the durable worker.
  await db.execute(sql`WITH gate AS MATERIALIZED (SELECT pg_advisory_xact_lock(hashtextextended('edunet:account-management',0))), candidate AS (
      SELECT id,account_identity_id,email,auth_version FROM ${table} CROSS JOIN gate WHERE lower(email)=${email} AND password IS NOT NULL AND auth_provider<>'reviewer'
      ${role === 'admin' ? sql`` : sql`AND status IN ('approved','pending')`}
      ${purpose === 'verify' ? sql`AND email_verified IS DISTINCT FROM 'true'` : sql``} LIMIT 1
    ), token AS (
      INSERT INTO auth_action_tokens(token_hash,account_identity_id,user_role,user_id,email,auth_version,purpose,expires_at)
      SELECT ${tokenHash},account_identity_id,${role},id,email,auth_version,${purpose},now()+make_interval(mins=>${minutes}) FROM candidate
      ON CONFLICT(account_identity_id,purpose) DO UPDATE SET token_hash=excluded.token_hash,user_role=excluded.user_role,user_id=excluded.user_id,email=excluded.email,auth_version=excluded.auth_version,expires_at=excluded.expires_at RETURNING token_hash
    ) INSERT INTO auth_mail_jobs(encrypted_payload,token_hash,expires_at)
      SELECT ${mail},token_hash,now()+make_interval(mins=>${minutes}) FROM token`);
}
function requestAction(purpose: 'reset' | 'verify'): RequestHandler {
  return async (req, res) => {
    const input = requestSchema.safeParse(req.body);
    if (!input.success) { res.status(400).json({ error: 'Choose a role and enter a valid email address.' }); return; }
    if (!authMailReady()) { res.status(503).json({ error: 'Account email delivery is not configured. Contact your administrator.' }); return; }
    try {
      await queueAccountAction(input.data.role, input.data.email, purpose);
      res.json({ accepted: true, message: 'If this email matches an eligible account, an email will be sent. Check your inbox and spam folder.' });
    } catch (error) { logSafeError('Account email request failed', error); res.status(503).json({ error: 'Unable to request account email. Try again later.' }); }
  };
}
accountActionsRouter.post('/forgot-password', requestLimit, requestAction('reset'));
accountActionsRouter.post('/resend-verification', requestLimit, requestAction('verify'));
accountActionsRouter.post('/reset-password', async (req, res) => {
  const input = resetSchema.safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: 'Use a valid link and matching passwords of 10–128 characters.' }); return; }
  try {
    const hash = await hashPassword(input.data.password);
    const result = await db.execute(sql`SELECT * FROM edunet_complete_auth_action(${digest(input.data.token)},'reset',${hash})`);
    if (!result.rows.length) { res.status(400).json({ error: 'This link is invalid, expired or already used. Request a new one.' }); return; }
    try { await queuePasswordNotice(String(result.rows[0].email)); } catch (error) { logSafeError('Password notice queue failed', error); }
    res.json({ success: true, role: result.rows[0].user_role });
  } catch (error) { logSafeError('Password reset failed', error); res.status(500).json({ error: 'Unable to reset password. Try again later.' }); }
});
accountActionsRouter.post('/verify-email', async (req, res) => {
  const token = z.string().regex(/^[a-f0-9]{64}$/).safeParse(req.body?.token);
  if (!token.success) { res.status(400).json({ error: 'Invalid verification link' }); return; }
  try {
    const result = await db.execute(sql`SELECT * FROM edunet_complete_auth_action(${digest(token.data)},'verify',NULL)`);
    if (!result.rows.length) { res.status(400).json({ error: 'This link is invalid, expired or already used. Request a new one.' }); return; }
    res.json({ success: true, role: result.rows[0].user_role });
  } catch (error) { logSafeError('Email verification failed', error); res.status(500).json({ error: 'Unable to verify email. Try again later.' }); }
});

export const changeAccountPassword: RequestHandler = async (req, res) => {
  const input = z.object({ currentPassword: z.string().min(1).max(128), password: newPassword, confirmation: newPassword }).refine(v => v.password === v.confirmation).safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: 'Enter the current password and matching new passwords of 10–128 characters.' }); return; }
  try {
    const table = roleTable(req.user!.role);
    const [account] = await db.select().from(table).where(eq(table.id, req.user!.id)).limit(1);
    if (!account?.password || !account.email || !(await verifyPassword(input.data.currentPassword, account.password))) { res.status(400).json({ error: 'Current password is incorrect or this account uses social sign-in.' }); return; }
    const hash = await hashPassword(input.data.password);
    const result = await db.execute(sql`SELECT * FROM edunet_change_account_password(${req.user!.role},${account.id}::uuid,${account.password},${hash},${digest(randomBytes(32).toString('hex'))})`);
    if (!result.rows.length) { res.status(409).json({ error: 'The account changed. Sign in again before retrying.' }); return; }
    try { await queuePasswordNotice(String(result.rows[0].email)); } catch (error) { logSafeError('Password notice queue failed', error); }
    res.json({ success: true, signInRequired: true });
  } catch (error) { logSafeError('Password change failed', error); res.status(500).json({ error: 'Unable to change password. Sign in again before retrying.' }); }
};
