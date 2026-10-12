import { canManageStudentsAndParents } from '../utils/managementPermissions';

export const DEFAULT_USER_NAME = '未命名用户';

export const pickDisplayName = (input?: unknown) => {
  if (typeof input !== 'string') return '';
  const value = input.trim();
  return value || '';
};

export const maskOpenId = (openid?: string | null) => {
  if (!openid) return null;
  if (openid.length <= 8) return openid;
  return `${openid.slice(0, 4)}***${openid.slice(-4)}`;
};

type PublicUserSource = {
  id: string;
  displayName?: string | null;
  name?: string | null;
  email?: string | null;
  password?: string | null;
  emailVerified?: string | null;
  avatarUrl?: string | null;
  status?: string | null;
  authProvider?: string | null;
  wechatOpenId?: string | null;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
};

export const toPublicUser = (user: PublicUserSource, role: 'teacher' | 'parent' | 'admin', includeEmail = false) => {
  const displayName = user?.displayName || user?.name || DEFAULT_USER_NAME;
  return {
    id: user.id,
    role,
    email: includeEmail ? user.email || null : null,
    hasPassword: Boolean(user.password),
    emailVerified: user.emailVerified === 'true',
    name: displayName, // legacy key
    displayName,
    avatarUrl: user.avatarUrl || null,
    status: user.status || 'approved',
    authProvider: user.authProvider || 'wechat',
    wechatOpenIdMasked: maskOpenId(user.wechatOpenId),
    canManageStudentsAndParents: canManageStudentsAndParents({ role, wechatOpenId: user.wechatOpenId }),
    createdAt: user.createdAt || null,
    updatedAt: user.updatedAt || null,
  };
};

// Session claims come only from authenticated server middleware, never from a DB row or request body.
export const toSessionUser = (user: Parameters<typeof toPublicUser>[0], session: { role: 'teacher' | 'parent' | 'admin'; isReviewer?: boolean; reviewerStudentId?: string }) => ({
  ...toPublicUser(user, session.role, true),
  ...(session.role === 'teacher' && session.isReviewer === true ? {
    isReviewer: true, reviewerStudentId: session.reviewerStudentId || null, canManageStudentsAndParents: false,
  } : {}),
});
