import { buildApiUrl } from '@/config/api';
import { getAuthHeaders } from '@/utils/auth';

export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(status: number, message: string, payload: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

const readResponse = async (response: Response) => {
  if (response.status === 204) return null;
  const contentType = response.headers.get('content-type') || '';
  return contentType.includes('application/json')
    ? response.json()
    : response.text();
};

export async function apiRequest<T = unknown>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(buildApiUrl(endpoint), {
    ...options,
    headers: {
      ...getAuthHeaders(),
      ...options.headers,
    },
  });
  const payload = await readResponse(response);
  if (!response.ok) {
    const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : null;
    const message = String(record?.details || record?.message || record?.error || payload || `Request failed (${response.status})`);
    throw new ApiError(response.status, message, payload);
  }
  return payload as T;
}

export const jsonBody = (value: unknown): RequestInit => ({
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(value),
});

export async function downloadAuthenticated(endpoint: string, filename: string) {
  const response = await fetch(buildApiUrl(endpoint), { headers: getAuthHeaders() });
  if (!response.ok) {
    const payload = await readResponse(response);
    throw new ApiError(response.status, String((payload as Record<string, unknown>)?.error || 'Download failed'), payload);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
