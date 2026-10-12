// Only fixed event labels and allowlisted classifications may enter logs.
// Database errors can contain full SQL parameters, credentials and student data.
export function logSafeError(event: string, error?: unknown): void {
  const code = (error as { code?: unknown } | null)?.code;
  const databaseCode = typeof code === 'string' && ['23505', '23503', '23514', '40001', '40P01', '08006'].includes(code) ? code : undefined;
  console.error(event, { ...(databaseCode ? { databaseCode } : {}) });
}
