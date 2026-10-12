import request from 'supertest';
import { beforeAll, beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createMockDb } from '../helpers/mockDb';
import { hashPassword } from '../../server/auth/password';
const db = createMockDb();
vi.mock('../../server/db', () => ({ db }));
vi.mock('dotenv', () => ({ default: { config: vi.fn() } }));
let app: Parameters<typeof request>[0];
let token: typeof import('../../server/utils/auth').generateToken;
const id = '11111111-1111-4111-8111-111111111111';
const actor = '22222222-2222-4222-8222-222222222222';
const rawToken = 'f'.repeat(64);
beforeAll(async () => { ({ app } = await import('../../server/index')); ({ generateToken: token } = await import('../../server/utils/auth')); });
beforeEach(() => {
  db.reset();
  vi.stubEnv('AUTH_MAIL_MODE', 'local'); vi.stubEnv('EDUNET_DEV_MODE', 'true'); vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('WEB_APP_URL', 'http://localhost:3001');
});
afterEach(() => vi.unstubAllEnvs());
const auth = (role: 'admin' | 'teacher' | 'parent' = 'admin', authVersion = 0) => {
  db.queueSelect([{ id: actor, status: 'approved', authVersion }]);
  return `Bearer ${token({ id: actor, role, name: role, authVersion })}`;
};

it.each(['email', 'google', 'wechat'])('changes roles for %s identities without a WeChat requirement', async authProvider => {
  const authorization = auth();
  db.queueSelect([{ id, accountIdentityId: id, authProvider, email: 'owner@example.test', name: 'Owner', password: null }]);
  db.queueExecute([{ roles: ['teacher', 'parent'] }]);
  const res = await request(app).post('/api/admin/users/set-roles').set('Authorization', authorization).send({ sourceRole: 'parent', sourceId: id, roles: ['parent', 'teacher'], displayName: 'Owner' });
  expect(res.status).toBe(200); expect(res.body.roles).toEqual(['teacher', 'parent']);
});
it.each([
  ['OWN_ADMIN_ROLE',400],['LAST_ADMIN_ROLE',400],['PARENT_HAS_BINDINGS',400],['ACCOUNT_CHANGED',409],['ADMIN_ACCESS_REQUIRED',403]
])('returns a safe denial for atomic guard %s', async (tag, status) => {
  const authorization = auth();
  db.queueSelect([{ id, name: 'Owner', password: null }]);
  vi.spyOn(db,'execute').mockRejectedValueOnce(new Error(String(tag)+' PRIVATE-SQL-PARAMETERS'));
  const res = await request(app).post('/api/admin/users/set-roles').set('Authorization',authorization).send({ sourceRole:'parent',sourceId:id,roles:['teacher'] });
  expect(res.status).toBe(status); expect(JSON.stringify(res.body)).not.toContain('PRIVATE-SQL');
});
it('does not merge a separate account with a colliding email', async () => {
  const authorization=auth(); db.queueSelect([{id,name:'Owner',password:null}]);
  vi.spyOn(db,'execute').mockRejectedValueOnce(Object.assign(new Error('PRIVATE SQL'),{code:'23505'}));
  const res=await request(app).post('/api/admin/users/set-roles').set('Authorization',authorization).send({sourceRole:'parent',sourceId:id,roles:['teacher']});
  expect(res.status).toBe(409); expect(res.body.error).toContain('separate account');
});
it('prevents assigning reviewer identities to other roles', async () => {
  const authorization=auth(); db.queueSelect([{id,authProvider:'reviewer'}]);
  const execute=vi.spyOn(db,'execute');
  expect((await request(app).post('/api/admin/users/assign-role').set('Authorization',authorization).send({sourceRole:'teacher',sourceId:id,targetRole:'admin'})).status).toBe(403);
  expect(execute).not.toHaveBeenCalled();
});
it.each(['/api/admin/users/assign-role','/api/admin/users/set-roles'])('restricts role writes at %s to administrators',async path=>{
  expect((await request(app).post(path).send({})).status).toBe(401);
  expect((await request(app).post(path).set('Authorization',auth('parent')).send({})).status).toBe(403);
});
it('returns only an acknowledgement for account email requests',async()=>{
  const execute=vi.spyOn(db,'execute');
  for(const email of ['exists@example.test','missing@example.test']) {
    const res=await request(app).post('/api/auth/web/forgot-password').send({role:'teacher',email});
    expect(res.status).toBe(200); expect(res.body).toEqual({accepted:true,message:'If this email matches an eligible account, an email will be sent. Check your inbox and spam folder.'});
    expect(JSON.stringify(res.body)).not.toContain('token');
  }
  expect(execute).toHaveBeenCalledTimes(2);
});
it('reports unconfigured delivery without looking up an account',async()=>{
  vi.stubEnv('AUTH_MAIL_MODE','resend'); vi.stubEnv('RESEND_API_KEY','');
  const execute=vi.spyOn(db,'execute');
  expect((await request(app).post('/api/auth/web/forgot-password').send({role:'admin',email:'any@example.test'})).status).toBe(503);
  expect(execute).not.toHaveBeenCalled();
});
it.each([
  {token:'bad',password:'valid-password',confirmation:'valid-password'},
  {token:rawToken,password:'short',confirmation:'short'},
  {token:rawToken,password:'valid-password',confirmation:'different-password'}
])('rejects invalid reset input before database writes',async body=>{
  const execute=vi.spyOn(db,'execute');
  expect((await request(app).post('/api/auth/web/reset-password').send(body)).status).toBe(400);
  expect(execute).not.toHaveBeenCalled();
});
it('resets a password without auto-login and queues a notification',async()=>{
  db.queueExecute([{email:'owner@example.test',user_role:'parent'}]);
  const execute=vi.spyOn(db,'execute');
  const res=await request(app).post('/api/auth/web/reset-password').send({token:rawToken,password:'valid-password',confirmation:'valid-password'});
  expect(res.status).toBe(200);expect(res.body).toEqual({success:true,role:'parent'});expect(res.body.token).toBeUndefined();
  expect(execute).toHaveBeenCalledTimes(2);
});
it('rejects expired, replayed and unknown tokens with the same response',async()=>{
  const res=await request(app).post('/api/auth/web/reset-password').send({token:'e'.repeat(64),password:'valid-password',confirmation:'valid-password'});
  expect(res.status).toBe(400);expect(res.body.error).toContain('invalid, expired or already used');
});
it('verifies email using a POST and does not issue an approval or session',async()=>{
  db.queueExecute([{email:'owner@example.test',user_role:'teacher'}]);
  const res=await request(app).post('/api/auth/web/verify-email').send({token:rawToken});
  expect(res.status).toBe(200);expect(res.body).toEqual({success:true,role:'teacher'});
});
it('denies password login for an approved but unverified email account',async()=>{
  db.queueSelect([{id,status:'approved',emailVerified:'false',password:await hashPassword('valid-password')}]);
  const res=await request(app).post('/api/login').send({role:'parent',email:'owner@example.test',password:'valid-password'});
  expect(res.status).toBe(401);expect(res.body.status).toBe('email_verification_required');
});
it('changes password only after verifying the current one and requires a new sign-in',async()=>{
  const authorization=auth('teacher');
  db.queueSelect([{id:actor,email:'owner@example.test',password:await hashPassword('current-password')}]);
  db.queueExecute([{email:'owner@example.test',user_role:'teacher'}]);
  const res=await request(app).put('/api/profile/password').set('Authorization',authorization).send({currentPassword:'current-password',password:'updated-password',confirmation:'updated-password'});
  expect(res.status).toBe(200);expect(res.body).toEqual({success:true,signInRequired:true});
});
it('rejects an incorrect current password before changing credentials',async()=>{
  const authorization=auth('teacher');
  db.queueSelect([{id:actor,email:'owner@example.test',password:await hashPassword('current-password')}]);
  const execute=vi.spyOn(db,'execute');
  expect((await request(app).put('/api/profile/password').set('Authorization',authorization).send({currentPassword:'wrong',password:'updated-password',confirmation:'updated-password'})).status).toBe(400);
  expect(execute).not.toHaveBeenCalled();
});
it('rejects old sessions when the credential version has advanced',async()=>{
  db.queueSelect([{id:actor,status:'approved',authVersion:2}]);
  const old=token({id:actor,role:'teacher',name:'Teacher',authVersion:1});
  expect((await request(app).get('/api/profile').set('Authorization',`Bearer ${old}`)).status).toBe(401);
});
it('denies first-time Google admin signup',async()=>{
  vi.stubEnv('GOOGLE_CLIENT_ID','client');vi.stubEnv('GOOGLE_CLIENT_SECRET','secret');vi.stubEnv('API_PUBLIC_URL','https://api.example.test');vi.stubEnv('WEB_APP_URL','https://web.example.test');
  const start=await request(app).get('/api/auth/web/google/start?role=admin');
  const nonce=new URL(start.headers.location).searchParams.get('state');
  vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce({ok:true,json:async()=>({access_token:'access'})}).mockResolvedValueOnce({ok:true,json:async()=>({sub:'google-user',email:'owner@example.test',email_verified:true})}));
  db.queueSelect([]);db.queueSelect([]);
  const insert=vi.spyOn(db,'insert');
  const res=await request(app).get(`/api/auth/web/google/callback?code=code&state=${nonce}`).set('Cookie',start.headers['set-cookie'][0]);
  expect(res.headers.location).toContain('account_not_found');expect(insert).not.toHaveBeenCalled();
});
it('supports Google sign-in for an already assigned administrator role',async()=>{
  vi.stubEnv('GOOGLE_CLIENT_ID','client');vi.stubEnv('GOOGLE_CLIENT_SECRET','secret');vi.stubEnv('API_PUBLIC_URL','https://api.example.test');vi.stubEnv('WEB_APP_URL','https://web.example.test');
  const start=await request(app).get('/api/auth/web/google/start?role=admin');
  const nonce=new URL(start.headers.location).searchParams.get('state');
  vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce({ok:true,json:async()=>({access_token:'access'})}).mockResolvedValueOnce({ok:true,json:async()=>({sub:'google-user',email:'owner@example.test',email_verified:true})}));
  db.queueSelect([{id,authProvider:'google',googleSubject:'google-user',name:'Admin',authVersion:3}]);
  const res=await request(app).get(`/api/auth/web/google/callback?code=code&state=${nonce}`).set('Cookie',start.headers['set-cookie'][0]);
  expect(res.headers.location).toContain('result=success');
  const cookie=res.headers['set-cookie'].find((value:string)=>value.startsWith('edunet_oauth_session='));
  const value=decodeURIComponent(cookie.split(';')[0].split('=').slice(1).join('='));
  const {verifyToken}=await import('../../server/utils/auth');expect(verifyToken(value)).toMatchObject({role:'admin',authVersion:3});
});
it('reuses a proven provider identity without looking up matching emails',async()=>{
  db.queueExecute([{account_identity_id:id}]);
  const {providerAccountIdentity}=await import('../../server/services/providerIdentity');
  const read=vi.spyOn(db,'select');
  await expect(providerAccountIdentity({googleSubject:'proven-subject'})).resolves.toBe(id);expect(read).not.toHaveBeenCalled();
});
it('rejects conflicting provider identities instead of merging them',async()=>{
  db.queueExecute([{account_identity_id:id},{account_identity_id:actor}]);
  const {providerAccountIdentity}=await import('../../server/services/providerIdentity');
  await expect(providerAccountIdentity({wechatUnionId:'proven-union'})).rejects.toThrow('conflicting');
});
it('does not let an unverified email account restore a previous session',async()=>{
  db.queueSelect([{id:actor,status:'approved',authProvider:'email',emailVerified:'false'}]);
  expect((await request(app).get('/api/profile').set('Authorization',`Bearer ${token({id:actor,role:'parent',name:'Parent'})}`)).status).toBe(401);
});
