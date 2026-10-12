export function migrationConnection(databaseUrl: string) {
  const url = new URL(databaseUrl);
  const local = ['localhost', '127.0.0.1', '[::1]', 'host.docker.internal'].includes(url.hostname);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('DATABASE_URL must use PostgreSQL.');
  // Session locks and SET state require a direct connection. Neon transaction
  // pooling can assign later statements to another PostgreSQL session.
  if (url.hostname.endsWith('.neon.tech')) url.hostname = url.hostname.replace(/-pooler\./, '.');
  // pg's sslmode query parameters can replace the explicit SSL object. Normalize
  // them so remote migration never silently disables certificate verification.
  for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) url.searchParams.delete(key);
  return { connectionString: url.toString(), ssl: local ? false : { rejectUnauthorized: true } };
}
