import { requestJson } from '@/services/http';
import type { Student } from '@/services/studentsApi';
export interface StudentInput {
    name: string;
    grade: string;
    parentIds: string[];
}
export function parentIdsFor(student: Pick<Student, 'parentIds' | 'parentId'>) {
    return [...new Set([...(student.parentIds || []), ...(student.parentId ? [student.parentId] : [])])];
}
export async function saveStudentProfile(input: StudentInput, id?: string): Promise<Student> {
    return requestJson<Student>(id ? `students/${encodeURIComponent(id)}` : 'students', { method: id ? 'PUT' : 'POST', body: input });
}
export async function saveStudentAssignments(id: string, subjectIds: string[]) {
    const endpoint = `students/${encodeURIComponent(id)}/subjects`;
    const current = await requestJson<string[]>(endpoint);
    if (current.length !== subjectIds.length || subjectIds.some(value => !current.includes(value))) {
        // Explicit existing backend option: preserve recorded progress on reassignment.
        await requestJson(endpoint, { method: 'PUT', body: { subjectIds, resetProgress: 'keep' } });
    }
    const reloaded = await requestJson<string[]>(endpoint);
    if (reloaded.length !== subjectIds.length || subjectIds.some(id => !reloaded.includes(id)))
        throw new Error('Assignments could not be confirmed');
    return reloaded;
}
// The admin aggregate does not carry all bindings. Always pass a fresh student DTO here.
export function adminParentIds(current: Student, originalPrimary: string | null | undefined, selectedPrimary: string) {
    const all = parentIdsFor(current);
    if ((originalPrimary || '') === selectedPrimary)
        return all;
    return [...new Set([...(selectedPrimary ? [selectedPrimary] : []), ...all.filter(id => id !== originalPrimary)])];
}
