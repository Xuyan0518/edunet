export type DatabaseSslConfig = false | { rejectUnauthorized: boolean };

const LOCAL_DATABASE_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export function databaseSslConfig(
  databaseUrl: string,
  rejectUnauthorized = true,
  sslModeOverride?: string,
): DatabaseSslConfig {
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error('Invalid DATABASE_URL');
  }

  const sslMode = sslModeOverride?.toLowerCase() || parsed.searchParams.get('sslmode')?.toLowerCase();
  if (LOCAL_DATABASE_HOSTS.has(parsed.hostname) || sslMode === 'disable') return false;
  return { rejectUnauthorized };
}

export const databaseSslRejectUnauthorized = (value: string | undefined): boolean => value !== 'false';
