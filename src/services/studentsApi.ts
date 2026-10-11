import { requestJson } from './http';
export interface Student {
    id: string;
    name: string;
    grade: string;
    parentId?: string;
    parentIds?: string[];
    createdAt?: string;
}
export const studentsApi = {
    list: (signal?: AbortSignal) => requestJson<Student[]>('students', { signal }),
    get: (id: string, signal?: AbortSignal) => requestJson<Student>(`students/${encodeURIComponent(id)}`, { signal }),
};
