export function migrationConnection(databaseUrl: string) {
  const url = new URL(databaseUrl);
  const local = ['localhost', '127.0.0.1', '[::1]', 'host.docker.internal'].includes(url.hostname);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('DATABASE_URL must use PostgreSQL.');
  // pg's sslmode query parameters can replace the explicit SSL object. Normalize
  // them so remote migration never silently disables certificate verification.
  for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) url.searchParams.delete(key);
  return { connectionString: url.toString(), ssl: local ? false : { rejectUnauthorized: true } };
}
