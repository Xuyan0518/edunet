const isActionLockError = (err) => {
  if (!err || typeof err !== "object") return false;
  return err.error === "ACTION_LOCKED" || (err.statusCode === 409 && !!err.lock);
};

const buildActionLockMessage = (err, fallback = "当前有老师正在操作该学生，请稍后再试。") => {
  if (!isActionLockError(err)) return "";
  const baseMessage = err.message || fallback;
  const remainingMs = Number(err?.lock?.remainingMs || 0);
  if (remainingMs > 0) {
    const seconds = Math.max(1, Math.ceil(remainingMs / 1000));
    return `${baseMessage}（预计 ${seconds} 秒后可重试）`;
  }
  return baseMessage;
};

const showActionLockToast = (err, fallback) => {
  if (!isActionLockError(err)) return false;
  wx.showToast({
    title: buildActionLockMessage(err, fallback),
    icon: "none",
    duration: 2600,
  });
  return true;
};

module.exports = {
  isActionLockError,
  buildActionLockMessage,
  showActionLockToast,
};
