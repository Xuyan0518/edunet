import { buildApiUrl } from '@/config/api';
import { getAuthToken } from '@/utils/auth';
export class ApiError extends Error {
    constructor(public status: number, public details: Record<string, unknown>) {
        super(typeof details.message === 'string' ? details.message : typeof details.error === 'string' ? details.error : `Request failed (${status})`);
        this.name = 'ApiError';
    }
    get code() { return this.details.code || this.details.error; }
    get conflict() { return this.status === 409 ? (this.code === 'ACTION_LOCKED' ? 'locked' : this.code === 'CONFLICT' ? 'stale' : 'duplicate') : null; }
}
type RequestOptions = Omit<RequestInit, 'body'> & {
    body?: unknown;
    auth?: boolean;
    token?: string;
};
export const SESSION_EXPIRED = 'edunet:session-expired';
async function request(endpoint: string, options: RequestOptions = {}, returnErrors = false) {
    const { body, auth = true, token, ...init } = options;
    const credential = token ?? (auth ? getAuthToken() : null);
    const headers = new Headers(init.headers);
    if (body !== undefined)
        headers.set('Content-Type', 'application/json');
    if (credential)
        headers.set('Authorization', `Bearer ${credential}`);
    // Intentionally no retries: a lost mutation response is an unknown outcome.
    const response = await fetch(buildApiUrl(endpoint), { ...init, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    if (!response.ok) {
        let details: Record<string, unknown> = {};
        try {
            const value = await response.clone().json();
            if (value && typeof value === 'object')
                details = value;
        }
        catch { /* Never display raw proxy HTML or provider output. */ }
        if (response.status === 401 && auth && credential && typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent(SESSION_EXPIRED, { detail: credential }));
        }
        if (!returnErrors)
            throw new ApiError(response.status, details);
    }
    return response;
}
export async function requestJson<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    const response = await request(endpoint, options);
    const text = await response.text();
    return (text.trim() ? JSON.parse(text) : undefined) as T;
}
export async function requestDownload(endpoint: string, options?: RequestOptions) {
    const response = await request(endpoint, options);
    const contentType = response.headers.get('Content-Type') || '';
    if (/json|text\/html/i.test(contentType)) throw new Error('The export returned a message instead of a file. Please retry after checking the request.');
    const disposition = response.headers.get('Content-Disposition') || '';
    const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
    let filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] || 'download';
    if (encoded) {
        try {
            filename = decodeURIComponent(encoded);
        }
        catch { /* Use fallback. */ }
    }
    return { blob: await response.blob(), filename: [...filename].map(char => char.charCodeAt(0) < 32 || char === '/' || char === '\\' ? '_' : char).join('') };
}
export function queryString(values: Record<string, string | number | boolean | undefined | null>) {
    const query = new URLSearchParams();
    Object.entries(values).forEach(([key, value]) => { if (value !== undefined && value !== null)
        query.set(key, String(value)); });
    return query.toString();
}
// Migration adapter: preserve Response-based callers while sharing credentials and expiry.
// Only URLs under the configured API base are accepted, so bearer tokens cannot leak off-site.
export function fetchApiResponse(url: string, options: RequestInit = {}): Promise<Response> {
    const base = buildApiUrl('');
    if (!url.startsWith(base))
        throw new Error('Expected a URL under the configured API base');
    const { body, ...init } = options;
    if (body != null && typeof body !== 'string')
        throw new Error('Expected a JSON request body');
    return request(url.slice(base.length), { ...init, body: body ? JSON.parse(body as string) : undefined }, true);
}
