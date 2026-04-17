process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'unit-test-secret';
process.env.WECHAT_APP_ID = process.env.WECHAT_APP_ID || 'wx-test-app-id';
process.env.WECHAT_APP_SECRET = process.env.WECHAT_APP_SECRET || 'wx-test-app-secret';
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3001,http://localhost:5173';
