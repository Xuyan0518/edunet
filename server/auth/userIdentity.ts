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

export const toPublicUser = (user: any, role: 'teacher' | 'parent' | 'admin') => {
  const displayName = user?.displayName || user?.name || DEFAULT_USER_NAME;
  return {
    id: user.id,
    role,
    name: displayName, // legacy key
    displayName,
    avatarUrl: user.avatarUrl || null,
    status: user.status || 'approved',
    authProvider: user.authProvider || 'wechat',
    wechatOpenIdMasked: maskOpenId(user.wechatOpenId),
    createdAt: user.createdAt || null,
    updatedAt: user.updatedAt || null,
  };
};
