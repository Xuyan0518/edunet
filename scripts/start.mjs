import dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import { validateProductionSecurity } from '../server/utils/securityConfig.ts';

dotenv.config();
try {
  validateProductionSecurity();
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
  if (process.env.NODE_ENV === 'production') {
    for (const name of ['API_PUBLIC_URL', 'WEB_APP_URL']) {
      let url;
      try { url = new URL(process.env[name]); } catch { throw new Error(`${name} must be an HTTPS URL.`); }
      if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
        throw new Error(`${name} must be an HTTPS origin without credentials, path or query.`);
      }
    }
    if (process.env.SERVE_WEB !== 'false' && !existsSync(new URL('../dist/index.html', import.meta.url))) {
      throw new Error('The web build is missing. Run npm run build before startup.');
    }
    if (process.env.AUTH_MAIL_ENABLED !== 'false' && (!process.env.RESEND_API_KEY || !process.env.AUTH_EMAIL_FROM)) {
      throw new Error('Authentication mail requires RESEND_API_KEY and AUTH_EMAIL_FROM, or explicit AUTH_MAIL_ENABLED=false.');
    }
  }
} catch (error) {
  // Only configuration validation messages reach this output; never dump an environment or URL.
  console.error(`Startup configuration error: ${error.message}`);
  process.exit(1);
}
await import('../server/index.ts');
