import type { SessionUser } from '../../src/features/auth/session';
export const roles: Record<string, SessionUser> = {
  teacher: { id: 'teacher', name: 'Teacher', role: 'teacher', status: 'approved' },
  manager: { id: 'manager', name: 'Manager', role: 'teacher', status: 'approved', canManageStudentsAndParents: true },
  admin: { id: 'admin', name: 'Admin', role: 'admin', status: 'approved' },
  parent: { id: 'secondary-parent', name: 'Parent', role: 'parent', status: 'approved' },
  reviewer: { id: 'reviewer', name: 'Reviewer', role: 'teacher', status: 'approved', isReviewer: true, reviewerStudentId: 'demo' },
};
export const secondaryChildren = [{ id: 'child-1', name: 'Child One', grade: 'P3', parentId: 'primary-parent', parentIds: ['primary-parent', 'secondary-parent'] }, { id: 'child-2', name: 'Child Two', grade: 'P5', parentId: 'secondary-parent', parentIds: ['secondary-parent'] }];
export function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return { get length() { return map.size; }, key: i => [...map.keys()][i] ?? null, getItem: key => map.get(key) ?? null, setItem: (key, value) => { map.set(key, String(value)); }, removeItem: key => { map.delete(key); }, clear: () => map.clear() };
}
