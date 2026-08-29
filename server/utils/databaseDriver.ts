export type DatabaseDriver = 'neon-http' | 'node-postgres';

export const selectDatabaseDriver = (databaseUrl: string): DatabaseDriver =>
  /neon\.tech/i.test(databaseUrl) ? 'neon-http' : 'node-postgres';
