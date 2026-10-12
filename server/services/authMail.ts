import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '../db';
import { logSafeError } from '../utils/safeLog';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface AuthMail { to: string; subject: string; text: string }
function encryptionKey() {
  const secret = process.env.AUTH_MAIL_ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!secret) throw new Error('Auth mail encryption key required');
  return createHash('sha256').update(`edunet-auth-mail:${secret}`).digest();
}
export function encryptAuthMail(mail: AuthMail): string {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(mail)), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map(part => part.toString('base64url')).join('.');
}
export function decryptAuthMail(payload: string): AuthMail {
  const [iv, tag, encrypted] = payload.split('.').map(part => Buffer.from(part, 'base64url'));
  const cipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  cipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([cipher.update(encrypted), cipher.final()]).toString());
}
export function authMailReady(): boolean {
  if (!(process.env.AUTH_MAIL_ENCRYPTION_KEY || process.env.JWT_SECRET)) return false;
  if (process.env.AUTH_MAIL_MODE === 'local') return process.env.NODE_ENV !== 'production' && process.env.EDUNET_DEV_MODE === 'true';
  return process.env.AUTH_MAIL_ENABLED !== 'false' && process.env.EDUNET_DEV_MODE !== 'true' && !!process.env.RESEND_API_KEY && !!process.env.AUTH_EMAIL_FROM;
}
export function authWebsite(): URL {
  const url = new URL(process.env.WEB_APP_URL || 'http://localhost:3001');
  if (url.username || url.password || (process.env.NODE_ENV === 'production' ? url.protocol !== 'https:' : !['https:', 'http:'].includes(url.protocol))) throw new Error('Invalid authentication website configuration');
  return url;
}
export async function queuePasswordNotice(email: string) {
  const mail = encryptAuthMail({ to: email, subject: 'EduNet password changed / 密码已更新', text: 'Your EduNet password was changed and existing sessions were signed out. If you did not make this change, contact your administrator immediately.\n您的桐心成长密码已更新，所有旧会话已退出。如非本人操作，请立即联系管理员。' });
  await db.execute(sql`INSERT INTO auth_mail_jobs(encrypted_payload,expires_at) VALUES(${mail},now()+interval '24 hours')`);
}
let draining = false;
export async function drainAuthMail(): Promise<void> {
  if (draining || !authMailReady()) return;
  draining = true;
  try {
    await db.execute(sql`DELETE FROM auth_action_tokens WHERE expires_at<now()`);
    await db.execute(sql`UPDATE auth_mail_jobs SET status='expired',encrypted_payload=NULL WHERE expires_at<now() AND encrypted_payload IS NOT NULL`);
    await db.execute(sql`UPDATE auth_mail_jobs j SET status='expired',encrypted_payload=NULL WHERE status='pending' AND token_hash IS NOT NULL AND NOT EXISTS(SELECT 1 FROM auth_action_tokens t WHERE t.token_hash=j.token_hash)`);
    const claimed = await db.execute(sql`WITH candidates AS (
      SELECT id FROM auth_mail_jobs WHERE encrypted_payload IS NOT NULL AND attempts<5 AND expires_at>now()
        AND ((status='pending' AND available_at<=now()) OR (status='processing' AND locked_until<now()))
      ORDER BY created_at LIMIT 5 FOR UPDATE SKIP LOCKED
    ) UPDATE auth_mail_jobs j SET status='processing',locked_until=now()+interval '60 seconds',attempts=attempts+1 FROM candidates c WHERE j.id=c.id RETURNING j.id,j.encrypted_payload,j.attempts`);
    for (const row of claimed.rows) {
      try {
        const mail = decryptAuthMail(String(row.encrypted_payload));
        if (process.env.AUTH_MAIL_MODE === 'local') {
          const dir = path.resolve('.dev/auth-mail');
          await mkdir(dir, { recursive: true, mode: 0o700 });
          await writeFile(path.join(dir, `${row.id}.json`), JSON.stringify(mail), { mode: 0o600 });
        } else {
          const response = await fetch('https://api.resend.com/emails', { method: 'POST', signal: AbortSignal.timeout(10_000), headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `auth-mail/${row.id}` }, body: JSON.stringify({ from: process.env.AUTH_EMAIL_FROM, to: [mail.to], subject: mail.subject, text: mail.text }) });
          if (!response.ok) throw new Error('Mail provider rejected delivery');
        }
        await db.execute(sql`UPDATE auth_mail_jobs SET status='sent',encrypted_payload=NULL,locked_until=NULL WHERE id=${row.id}::uuid`);
      } catch (error) {
        logSafeError('Authentication email delivery failed', error);
        await db.execute(sql`UPDATE auth_mail_jobs SET status=CASE WHEN attempts>=5 THEN 'failed' ELSE 'pending' END,
          available_at=now()+interval '30 seconds'*power(2,attempts),locked_until=NULL WHERE id=${row.id}::uuid`);
      }
    }
  } catch (error) { logSafeError('Authentication email queue failed', error); }
  finally { draining = false; }
}
export function startAuthMailWorker() {
  const timer = setInterval(() => { void drainAuthMail(); }, 5000);
  timer.unref();
  return timer;
}
