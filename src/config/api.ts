const getDefaultApiBaseUrl = () => {
  if (import.meta.env.DEV) return 'http://localhost:3003/api';
  if (typeof window !== 'undefined') return `${window.location.origin}/api`;
  return '/api';
};
export const API_CONFIG = { BASE_URL: import.meta.env.VITE_API_URL || getDefaultApiBaseUrl() } as const;

export function buildApiUrl(endpoint: string): string {
  if (/^(?:[a-z]+:)?\/\//i.test(endpoint)) throw new Error('Expected a relative API path');
  const base = API_CONFIG.BASE_URL.replace(/\/+$/, '').replace(/(?:\/api)+$/, '');
  return `${base}/api/${endpoint.replace(/^\/+/, '').replace(/^(?:api\/)+/, '')}`;
}
