import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createStagingAccess } from '../../server/middleware/stagingAccess';

const env = { DEPLOYMENT_ENV: 'staging', STAGING_ACCESS_USERNAME: 'qa', STAGING_ACCESS_PASSWORD: 'synthetic-staging-secret-2026-10-12' };
function app() {
  const server = express();
  server.use(createStagingAccess(env));
  server.all('*', (req, res) => res.json({ authorization: req.headers.authorization, ok: true }));
  return server;
}
describe('private staging boundary', () => {
  it.each(['/', '/login', '/assets/app.js', '/api/students', '/api/auth/web/forgot-password', '/api/ready/'])('protects browser and API paths %s', async path => {
    const res = await request(app()).get(path).set('Accept', 'application/json');
    expect(res.status).toBe(401);
    expect(res.headers['www-authenticate']).toContain('Basic');
    expect(res.headers['cache-control']).toBe('no-store');
  });
  it('exempts only GET/HEAD health endpoints, not other methods', async () => {
    expect((await request(app()).get('/api/ready')).status).toBe(200);
    expect((await request(app()).head('/api/health')).status).toBe(200);
    expect((await request(app()).post('/api/health')).status).toBe(401);
  });
  it('rejects invalid credentials and sets a secure cookie for valid access', async () => {
    expect((await request(app()).get('/api/students').auth('qa', 'wrong')).status).toBe(401);
    const res = await request(app()).get('/login').auth(env.STAGING_ACCESS_USERNAME, env.STAGING_ACCESS_PASSWORD);
    expect(res.status).toBe(200);
    const cookie = res.headers['set-cookie'][0];
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/SameSite=Lax/);
    const api = await request(app()).get('/api/students').set('Cookie', cookie.split(';')[0]).set('Authorization', 'Bearer application-token');
    expect(api.status).toBe(200);
    expect(api.body.authorization).toBe('Bearer application-token');
  });
  it('rejects forged and expired cookies', async () => {
    const server = app();
    const res = await request(server).get('/').auth(env.STAGING_ACCESS_USERNAME, env.STAGING_ACCESS_PASSWORD);
    const cookie = res.headers['set-cookie'][0].split(';')[0];
    expect((await request(server).get('/api/students').set('Cookie', cookie + 'a')).status).toBe(401);
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + 8 * 60 * 60_000 + 1000);
    expect((await request(server).get('/api/students').set('Cookie', cookie)).status).toBe(401);
  });
  it('fails closed with missing or weak staging credentials', () => {
    expect(() => createStagingAccess({ DEPLOYMENT_ENV: 'staging' })).toThrow();
    expect(() => createStagingAccess({ ...env, STAGING_ACCESS_PASSWORD: 'short' })).toThrow();
  });
  it('leaves production and development access to the application authentication', async () => {
    const server = express();
    server.use(createStagingAccess({ DEPLOYMENT_ENV: 'production' }));
    server.get('/', (_req, res) => res.sendStatus(200));
    expect((await request(server).get('/')).status).toBe(200);
  });
  it('renders a browser access form without triggering an HTTP authentication dialog', async () => {
    const res = await request(app()).get('/login').set('Accept', 'text/html');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Open staging');
    expect(res.headers['www-authenticate']).toBeUndefined();
    expect(res.text).not.toContain(env.STAGING_ACCESS_PASSWORD);
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(res.text).not.toContain('/assets/');
  });
  it('checks the origin and credentials before issuing the same secure access cookie', async () => {
    const server = express();
    server.use(createStagingAccess({ ...env, WEB_APP_URL: 'https://staging.example.test' }));
    const form = { username: env.STAGING_ACCESS_USERNAME, password: env.STAGING_ACCESS_PASSWORD };
    expect((await request(server).post('/__staging/login').type('form').send(form)).status).toBe(403);
    expect((await request(server).post('/__staging/login').set('Origin', 'https://evil.example.test').type('form').send(form)).status).toBe(403);
    expect((await request(server).post('/__staging/login').set('Origin', 'https://staging.example.test').type('form').send({ ...form, password: 'wrong' })).status).toBe(401);
    const res = await request(server).post('/__staging/login').set('Origin', 'https://staging.example.test').type('form').send(form);
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/login');
    expect(res.headers['set-cookie'][0]).toMatch(/HttpOnly/);
  });
  it('limits password attempts at the browser access form', async () => {
    const server = express();
    server.use(createStagingAccess({ ...env, WEB_APP_URL: 'https://staging.example.test' }));
    for (let attempt = 0; attempt < 10; attempt++) await request(server).post('/__staging/login').set('Origin', 'https://staging.example.test').type('form').send({ username: 'qa', password: 'wrong' });
    expect((await request(server).post('/__staging/login').set('Origin', 'https://staging.example.test').type('form').send({ username: 'qa', password: 'wrong' })).status).toBe(429);
  });
});
