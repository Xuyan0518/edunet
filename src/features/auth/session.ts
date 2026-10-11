import { ApiError, requestJson } from '@/services/http';
export type UserRole = 'teacher' | 'parent' | 'admin';
export interface SessionUser {
    id: string;
    name: string;
    displayName?: string;
    email?: string;
    role: UserRole;
    status?: string;
    authProvider?: string;
    isReviewer?: boolean;
    reviewerStudentId?: string;
    canManageStudentsAndParents?: boolean;
}
export type SessionState = {
    status: 'checking' | 'anonymous' | 'authenticated' | 'unavailable';
    user: SessionUser | null;
};
export function validateUser(user: SessionUser): SessionUser {
    if (!user?.id || !['teacher', 'parent', 'admin'].includes(user.role))
        throw new Error('Invalid session response');
    if (user.status && user.status !== 'approved')
        throw new ApiError(401, { error: 'Account is not approved' });
    if ((user.isReviewer || user.authProvider === 'reviewer') && (!user.isReviewer || !user.reviewerStudentId))
        throw new Error('Reviewer scope is unavailable');
    return user;
}
// Cached identity is never authorization. Only /profile establishes a restored session.
export class SessionController {
    state: SessionState = { status: 'checking', user: null };
    private generation = 0;
    private listeners = new Set<() => void>();
    constructor(private storage: Storage, private clearPrivateCache: () => void) { }
    subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
    snapshot = () => this.state;
    private publish(state: SessionState) { this.state = state; this.listeners.forEach(fn => fn()); }
    private store(token: string, user: SessionUser) {
        this.storage.setItem('edunet-token', token);
        this.storage.setItem('edunet-user', JSON.stringify(user));
        if (user.role === 'admin')
            this.storage.setItem('adminToken', token);
        else
            this.storage.removeItem('adminToken');
    }
    clear = () => {
        this.generation++;
        this.clearPrivateCache();
        ['edunet-token', 'edunet-user', 'adminToken'].forEach(key => this.storage.removeItem(key));
        // Explicit privacy policy: remove app drafts/seen markers on this device at logout.
        for (let i = this.storage.length - 1; i >= 0; i--) {
            const key = this.storage.key(i)!;
            if (key.startsWith('edunet:draft:') || key.startsWith('edunet:seen:'))
                this.storage.removeItem(key);
        }
        this.publish({ status: 'anonymous', user: null });
    };
    restore = async () => {
        const generation = ++this.generation;
        const tokens = [...new Set([this.storage.getItem('edunet-token'), this.storage.getItem('adminToken')].filter(Boolean))];
        this.clearPrivateCache();
        this.publish({ status: 'checking', user: null });
        if (!tokens.length) {
            this.clear();
            return;
        }
        for (const token of tokens) {
            try {
                const { user } = await requestJson<{
                    user: SessionUser;
                }>('profile', { token, auth: false });
                if (generation !== this.generation)
                    return;
                validateUser(user);
                this.store(token, user);
                this.publish({ status: 'authenticated', user });
                return;
            }
            catch (error) {
                if (generation !== this.generation)
                    return;
                if (!(error instanceof ApiError && [401, 403, 404].includes(error.status))) {
                    this.publish({ status: 'unavailable', user: null });
                    return;
                }
                // Try a distinct legacy admin credential only after confirmed rejection.
            }
        }
        this.clear();
    };
    login = async (endpoint: string, credentials: Record<string, string>) => {
        this.clear();
        const generation = this.generation;
        const payload = await requestJson<{
            user: SessionUser;
            token: string;
        }>(endpoint, { method: 'POST', body: credentials, auth: false, credentials: 'include' });
        if (generation !== this.generation)
            return false;
        if (!payload.token)
            throw new Error('Missing session credential');
        validateUser(payload.user);
        this.store(payload.token, payload.user);
        await this.restore();
        return this.state.status === 'authenticated';
    };
    refreshProfile = async () => {
        const generation = this.generation;
        const { user } = await requestJson<{
            user: SessionUser;
        }>('profile');
        if (generation !== this.generation)
            return;
        validateUser(user);
        const token = this.storage.getItem('edunet-token');
        if (!token)
            return;
        this.store(token, user);
        this.publish({ status: 'authenticated', user });
    };
}
