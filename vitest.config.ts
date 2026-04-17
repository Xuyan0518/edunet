import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['tests/setup/env.ts'],
    include: ['tests/**/*.test.ts'],
    clearMocks: true,
    restoreMocks: true,
    unstubGlobals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: 'coverage',
      include: [
        'server/auth/**/*.ts',
        'server/utils/auth.ts',
        'server/middleware/auth.ts',
        'server/middleware/parentStudent.ts',
        'miniprogram/utils/api.js',
        'miniprogram/utils/userIdentity.js',
      ],
      exclude: [
        'tests/**',
        '**/*.d.ts',
        '**/node_modules/**',
        'server/migrations/**',
        'dist/**',
        'coverage/**',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
