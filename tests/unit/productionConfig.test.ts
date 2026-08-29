import { describe, expect, it } from 'vitest';
import { assertProductionConfig } from '../../server/utils/productionConfig';

const completeConfig = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://example',
  JWT_SECRET: 'a-long-release-secret',
  WECHAT_APP_ID: 'wechat-app',
  WECHAT_APP_SECRET: 'wechat-secret',
  GOOGLE_CLIENT_ID: 'google-client',
  VITE_GOOGLE_CLIENT_ID: 'google-client',
  CORS_ORIGIN: 'https://app.example.com',
  FRONTEND_URL: 'https://app.example.com',
  DEEPSEEK_API_KEY: 'deepseek-key',
};

describe('assertProductionConfig', () => {
  it('rejects a production runtime with missing browser and provider settings', () => {
    expect(() => assertProductionConfig({
      ...completeConfig,
      CORS_ORIGIN: '',
      WECHAT_APP_SECRET: '',
    })).toThrow('CORS_ORIGIN, WECHAT_APP_SECRET');
  });

  it('accepts complete production settings and non-production runtimes', () => {
    expect(() => assertProductionConfig(completeConfig)).not.toThrow();
    expect(() => assertProductionConfig({ NODE_ENV: 'test' })).not.toThrow();
  });
});
