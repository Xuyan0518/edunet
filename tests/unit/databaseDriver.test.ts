import { describe, expect, it } from 'vitest';
import { selectDatabaseDriver } from '../../server/utils/databaseDriver';

describe('selectDatabaseDriver', () => {
  it('uses node-postgres for Render Postgres connection strings', () => {
    expect(selectDatabaseDriver('postgresql://user:password@dpg-example-a.singapore-postgres.render.com/db')).toBe(
      'node-postgres',
    );
  });

  it('keeps Neon databases on the HTTP driver', () => {
    expect(selectDatabaseDriver('postgresql://user:password@ep-example.us-east-2.aws.neon.tech/db')).toBe(
      'neon-http',
    );
  });
});
