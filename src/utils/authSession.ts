export function hasStoredToken(...tokens: Array<string | null | undefined>): boolean {
  return tokens.some((token) => Boolean(token?.trim()));
}

export function parseStoredUser<T>(userJson: string | null, token: string | null): T | null {
  if (!userJson || !hasStoredToken(token)) return null;

  try {
    const parsed = JSON.parse(userJson);
    return parsed && typeof parsed === 'object' ? parsed as T : null;
  } catch {
    return null;
  }
}
