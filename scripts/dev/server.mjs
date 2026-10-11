import fs from 'node:fs';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import dotenv from 'dotenv';
dotenv.config({ override: true });
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required in .env');
fs.mkdirSync('.dev', { recursive: true, mode: 0o700 });
const secretFile = '.dev/jwt-secret';
if (!process.env.JWT_SECRET) {
  if (!fs.existsSync(secretFile)) fs.writeFileSync(secretFile, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
  process.env.JWT_SECRET = fs.readFileSync(secretFile, 'utf8').trim();
}
// This launcher is exclusively for dev-database testing. Never send notifications.
process.env.EDUNET_DEV_MODE = 'true';
process.env.NOTIFICATIONS_ENABLED = 'false';
process.env.DB_LOG_QUERIES = 'false';
if (process.argv.includes('--web')) {
  // Keep Vite's /api proxy and the API on fixed internal ports in the workspace.
  process.env.API_PORT = '3003';
  process.env.API_HOST = '127.0.0.1';
  process.env.SERVE_WEB = 'false';
} else {
  process.env.API_HOST ||= '127.0.0.1';
}
console.log('Dev API: real configured database and AI; outbound notifications disabled.');
const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], { stdio: 'inherit', env: process.env });
for (const signal of ['SIGTERM','SIGINT']) process.on(signal, () => child.kill(signal));
child.on('exit', code => process.exit(code || 0));
