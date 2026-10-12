import { randomBytes } from 'node:crypto';

export function reviewerLoginEnabled(env = process.env): boolean {
  return env.REVIEWER_LOGIN_ENABLED === 'true';
}

export function validateProductionSecurity(env = process.env): void {
  if (env.NODE_ENV !== 'production') return;
  const secret = env.JWT_SECRET?.trim() || '';
  if (secret.length < 32 || /change[-_ ]?in[-_ ]?production|change[-_ ]?me|example|placeholder/i.test(secret)) {
    throw new Error('Production requires a non-default JWT_SECRET of at least 32 characters.');
  }
  if (env.EDUNET_DEV_MODE === 'true') {
    throw new Error('The development launcher cannot run in production.');
  }
  if (env.AUTH_MAIL_MODE === 'local') throw new Error('Production cannot use the local authentication mail inbox.');
  if (env.DEPLOYMENT_ENV === 'staging' && (!env.STAGING_ACCESS_USERNAME?.trim() || env.STAGING_ACCESS_USERNAME.includes(':') || (env.STAGING_ACCESS_PASSWORD?.length || 0) < 24)) {
    throw new Error('Private staging requires an explicit access username and password of at least 24 characters.');
  }
  if (env.AUTH_MAIL_ENCRYPTION_KEY && env.AUTH_MAIL_ENCRYPTION_KEY.trim().length < 32) throw new Error('Production authentication mail encryption keys must have at least 32 characters.');
  if (reviewerLoginEnabled(env) && (!env.REVIEWER_USERNAME?.trim() || (env.REVIEWER_PASSWORD?.length || 0) < 16 || !env.REVIEWER_STUDENT_ID?.trim())) {
    throw new Error('Enabled reviewer login requires an explicit username, a password of at least 16 characters and a demo student.');
  }
}

export function signingSecret(env = process.env): string {
  validateProductionSecurity(env);
  // An unconfigured development process gets a fresh, unpredictable key.
  return env.JWT_SECRET?.trim() || randomBytes(32).toString('hex');
}
