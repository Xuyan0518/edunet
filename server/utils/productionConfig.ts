export const REQUIRED_PRODUCTION_SETTINGS = [
  'CORS_ORIGIN',
  'DATABASE_URL',
  'DEEPSEEK_API_KEY',
  'FRONTEND_URL',
  'GOOGLE_CLIENT_ID',
  'JWT_SECRET',
  'VITE_GOOGLE_CLIENT_ID',
  'WECHAT_APP_ID',
  'WECHAT_APP_SECRET',
] as const;

export const assertProductionConfig = (env: Record<string, string | undefined>): void => {
  if (env.NODE_ENV !== 'production') return;

  const missing = REQUIRED_PRODUCTION_SETTINGS.filter((key) => !String(env[key] || '').trim());
  if (missing.length) {
    throw new Error(`Missing required production configuration: ${missing.join(', ')}`);
  }
};
