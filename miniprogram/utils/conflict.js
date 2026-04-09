const { formatChinaDateTime } = require("./chinaDate");

const formatUpdatedAt = (value) => {
  if (!value) return "未知时间";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "未知时间";
  return formatChinaDateTime(date);
};

const showConflictModal = (err, onReload) => {
  if (!err || err.error !== "CONFLICT") return false;
  const timeText = formatUpdatedAt(err.updatedAt);
  const who = err.updatedByName || "其他老师";
  wx.showModal({
    title: "内容已更新",
    content: `已被${who}在${timeText}修改，是否重新加载？`,
    confirmText: "重新加载",
    cancelText: "取消",
    success: (res) => {
      if (res.confirm && typeof onReload === "function") {
        onReload();
      }
    },
  });
  return true;
};

module.exports = { showConflictModal, formatUpdatedAt };
