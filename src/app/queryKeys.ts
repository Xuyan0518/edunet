import type { SessionUser } from '@/features/auth/session';
export const sessionKey = (user: SessionUser | null) => [user?.role ?? 'anonymous', user?.id ?? '', user?.reviewerStudentId ?? ''] as const;
export const queryKeys = {
    students: (user: SessionUser) => [...sessionKey(user), 'students'] as const,
    student: (user: SessionUser, id: string, ...context: string[]) => [...sessionKey(user), 'student', id, ...context] as const,
    resource: (user: SessionUser, path: string) => [...sessionKey(user), path] as const,
};
export const queryDefaults = { queries: { retry: false, refetchOnWindowFocus: false }, mutations: { retry: false } } as const;
