import { eq } from 'drizzle-orm';
import { db } from '../db';
import { adminsTable, parentsTable, teachersTable } from '../schema';
import type { AuthUser } from './auth';

export const MANAGEMENT_ALLOWED_WECHAT_OPEN_IDS = [
  'o-zVF3carqsMGxDM0OhAVBc0stcI',
  'o-zVF3YX1px9ZOZGXJ4BCwXItoDY',
  'o-zVF3RHZoOXq_TLMUhWTqDb1xHw',
] as const;
export const MANAGEMENT_ALLOWED_WECHAT_OPEN_ID = MANAGEMENT_ALLOWED_WECHAT_OPEN_IDS[0];

export const canManageStudentsAndParents = (user?: {
  role?: string | null;
  wechatOpenId?: string | null;
}) =>
  user?.role === 'admin' ||
  (user?.role === 'teacher' &&
    MANAGEMENT_ALLOWED_WECHAT_OPEN_IDS.includes(user.wechatOpenId as typeof MANAGEMENT_ALLOWED_WECHAT_OPEN_IDS[number]));

export const getAuthUserWithWechatOpenId = async (user: AuthUser) => {
  if (user.role === 'teacher') {
    const rows = await db
      .select({ id: teachersTable.id, role: teachersTable.authProvider, wechatOpenId: teachersTable.wechatOpenId })
      .from(teachersTable)
      .where(eq(teachersTable.id, user.id))
      .limit(1);
    return rows[0] ? { role: 'teacher', wechatOpenId: rows[0].wechatOpenId } : null;
  }
  if (user.role === 'parent') {
    const rows = await db
      .select({ id: parentsTable.id, role: parentsTable.authProvider, wechatOpenId: parentsTable.wechatOpenId })
      .from(parentsTable)
      .where(eq(parentsTable.id, user.id))
      .limit(1);
    return rows[0] ? { role: 'parent', wechatOpenId: rows[0].wechatOpenId } : null;
  }
  const rows = await db
    .select({ id: adminsTable.id, role: adminsTable.authProvider, wechatOpenId: adminsTable.wechatOpenId })
    .from(adminsTable)
    .where(eq(adminsTable.id, user.id))
    .limit(1);
  return rows[0] ? { role: 'admin', wechatOpenId: rows[0].wechatOpenId } : null;
};

export const canAuthUserManageStudentsAndParents = async (user?: AuthUser) => {
  if (!user) return false;
  const userWithOpenId = await getAuthUserWithWechatOpenId(user);
  return canManageStudentsAndParents(userWithOpenId || undefined);
};
