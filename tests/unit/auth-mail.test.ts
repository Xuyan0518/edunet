import { beforeAll, beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createMockDb } from '../helpers/mockDb';
const db=createMockDb();
vi.mock('../../server/db',()=>({db}));
vi.mock('node:fs/promises',()=>({mkdir:vi.fn(),writeFile:vi.fn()}));
let encryptAuthMail: typeof import('../../server/services/authMail').encryptAuthMail;
let decryptAuthMail: typeof import('../../server/services/authMail').decryptAuthMail;
let authMailReady: typeof import('../../server/services/authMail').authMailReady;
let authWebsite: typeof import('../../server/services/authMail').authWebsite;
let drainAuthMail: typeof import('../../server/services/authMail').drainAuthMail;
beforeAll(async()=>{({encryptAuthMail,decryptAuthMail,authMailReady,authWebsite,drainAuthMail}=await import('../../server/services/authMail'));});
beforeEach(()=>{db.reset();vi.stubEnv('AUTH_MAIL_ENCRYPTION_KEY','test-encryption-key-for-mail-only');vi.stubEnv('AUTH_MAIL_MODE','resend');vi.stubEnv('AUTH_MAIL_ENABLED','true');vi.stubEnv('EDUNET_DEV_MODE','false');vi.stubEnv('NOTIFICATIONS_ENABLED','true');vi.stubEnv('RESEND_API_KEY','test-key');vi.stubEnv('AUTH_EMAIL_FROM','Edunet <no-reply@example.test>');vi.stubEnv('NODE_ENV','test');});
afterEach(()=>vi.unstubAllEnvs());
it('encrypts queued links with authenticated randomized ciphertext',()=>{
  const mail={to:'private@example.test',subject:'Reset',text:'SECRET-RESET-TOKEN'};
  const a=encryptAuthMail(mail);expect(a).not.toBe(encryptAuthMail(mail));expect(a).not.toContain(mail.to);expect(a).not.toContain(mail.text);expect(decryptAuthMail(a)).toEqual(mail);
  const parts=a.split('.');parts[2]=Buffer.from('changed').toString('base64url');expect(()=>decryptAuthMail(parts.join('.'))).toThrow();
});
it('does not allow a local inbox in production',()=>{
  vi.stubEnv('AUTH_MAIL_MODE','local');vi.stubEnv('EDUNET_DEV_MODE','true');expect(authMailReady()).toBe(true);vi.stubEnv('NODE_ENV','production');expect(authMailReady()).toBe(false);
});
it('requires HTTPS in production and ignores caller-supplied hosts',()=>{
  vi.stubEnv('NODE_ENV','production');vi.stubEnv('WEB_APP_URL','http://attacker.example');expect(()=>authWebsite()).toThrow();vi.stubEnv('WEB_APP_URL','https://edunet.example');expect(authWebsite().origin).toBe('https://edunet.example');
});
it('controls authentication email independently and blocks real delivery during development testing',()=>{
  vi.stubEnv('NOTIFICATIONS_ENABLED','false');expect(authMailReady()).toBe(true);
  vi.stubEnv('AUTH_MAIL_ENABLED','false');expect(authMailReady()).toBe(false);
  vi.stubEnv('AUTH_MAIL_ENABLED','true');vi.stubEnv('EDUNET_DEV_MODE','true');expect(authMailReady()).toBe(false);
});
it('delivers a claimed job with an idempotency key and erases its sensitive payload',async()=>{
  db.queueExecute([]);db.queueExecute([]);db.queueExecute([]);db.queueExecute([{id:'11111111-1111-4111-8111-111111111111',attempts:1,encrypted_payload:encryptAuthMail({to:'owner@example.test',subject:'Reset',text:'LINK'})}]);
  const fetcher=vi.fn().mockResolvedValue({ok:true});vi.stubGlobal('fetch',fetcher);
  const execute=vi.spyOn(db,'execute');await drainAuthMail();
  expect(fetcher).toHaveBeenCalledOnce();expect(fetcher.mock.calls[0][1].headers['Idempotency-Key']).toBe('auth-mail/11111111-1111-4111-8111-111111111111');expect(execute).toHaveBeenCalledTimes(5);
});
it('queues a retry without logging the email, token or provider response',async()=>{
  db.queueExecute([]);db.queueExecute([]);db.queueExecute([]);db.queueExecute([{id:'11111111-1111-4111-8111-111111111111',attempts:1,encrypted_payload:encryptAuthMail({to:'PRIVATE-EMAIL@example.test',subject:'Reset',text:'PRIVATE-TOKEN'})}]);
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false}));const log=vi.spyOn(console,'error').mockImplementation(()=>{});
  const execute=vi.spyOn(db,'execute');await drainAuthMail();expect(execute).toHaveBeenCalledTimes(5);expect(JSON.stringify(log.mock.calls)).not.toMatch(/PRIVATE-EMAIL|PRIVATE-TOKEN/);
});
