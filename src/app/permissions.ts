import type { SessionUser } from '@/features/auth/session';
export type Capability = 'createStudent' | 'manageStudents' | 'catalog' | 'author' | 'strictTeacher' | 'queues' | 'admin' | 'bin';
export function can(user: SessionUser | null, action: Capability, studentId?: string): boolean {
    if (!user)
        return false;
    if (user.isReviewer && studentId && studentId !== user.reviewerStudentId)
        return false;
    switch (action) {
        case 'admin': return user.role === 'admin';
        case 'createStudent':
        case 'catalog':
        case 'queues': return !user.isReviewer && ['teacher', 'admin'].includes(user.role);
        case 'manageStudents': return !user.isReviewer && (user.role === 'admin' || (user.role === 'teacher' && user.canManageStudentsAndParents === true));
        case 'strictTeacher': return user.role === 'teacher' || user.role === 'admin';
        case 'author':
        case 'bin': return user.role === 'teacher' || user.role === 'admin';
    }
}
