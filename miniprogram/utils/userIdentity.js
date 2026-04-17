const DEFAULT_USER_NAME = "未命名用户";
const DEFAULT_IDENTITY_HINT = "未绑定微信";

const resolveDisplayName = (user = {}) => {
  const displayName =
    (typeof user.displayName === "string" && user.displayName.trim()) ||
    (typeof user.name === "string" && user.name.trim()) ||
    "";
  return displayName || DEFAULT_USER_NAME;
};

const resolveIdentityHint = (user = {}) => {
  const masked = typeof user.wechatOpenIdMasked === "string" ? user.wechatOpenIdMasked.trim() : "";
  return masked || DEFAULT_IDENTITY_HINT;
};

module.exports = {
  DEFAULT_USER_NAME,
  DEFAULT_IDENTITY_HINT,
  resolveDisplayName,
  resolveIdentityHint,
};
