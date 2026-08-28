import { describe, expect, it } from 'vitest';
import { buildAllowedCorsOrigins } from '../../server/utils/corsOrigins';

describe('buildAllowedCorsOrigins', () => {
  it('allows the Render service same-origin URL', () => {
    expect(buildAllowedCorsOrigins('', 'edunet-api-staging.onrender.com')).toContain(
      'https://edunet-api-staging.onrender.com',
    );
  });

  it('preserves explicitly configured origins', () => {
    expect(buildAllowedCorsOrigins('https://app.example.com, https://admin.example.com', '')).toEqual([
      'https://app.example.com',
      'https://admin.example.com',
    ]);
  });
});
