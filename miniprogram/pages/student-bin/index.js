const { request } = require("../../utils/api");

const GROUPS = [
  { key: "dailyProgress", title: "每日进度汇报" },
  { key: "weeklyReports", title: "每周汇报" },
  { key: "studentReports", title: "学习报告" },
  { key: "exams", title: "成绩记录" },
  { key: "papers", title: "试卷/测验" },
];

const typeLabels = {
  dailyProgress: "每日进度",
  weeklyReport: "每周汇报",
  studentReport: "学习报告",
  quarterlySummary: "旧版学期总结",
  yearlySummary: "旧版年度总结",
  exam: "成绩记录",
  paper: "试卷/测验",
};

const dateOnly = (value) => {
  if (!value) return "";
  return String(value).slice(0, 10);
};

const formatDeletedAt = (value) => {
  if (!value) return "-";
  return String(value).replace("T", " ").slice(0, 16);
};

const retentionText = (days) => {
  const n = Number(days);
  if (!Number.isFinite(n) || n <= 0) return "即将永久删除";
  return `还剩 ${n} 天`;
};

Page({
  data: {
    studentId: "",
    loading: true,
    sections: [],
    empty: false,
  },

  onLoad(query) {
    this.studentId = query.studentId || "";
    this.setData({ studentId: this.studentId });
  },

  onShow() {
    this.fetchBin();
  },

  onPullDownRefresh() {
    this.fetchBin().finally(() => wx.stopPullDownRefresh());
  },

  fetchBin() {
    if (!this.studentId) return Promise.resolve();
    this.setData({ loading: true });
    return request({ url: `/students/${this.studentId}/bin` })
      .then((data) => {
        const groups = data?.groups || {};
        const sections = GROUPS.map((group) => {
          const items = Array.isArray(groups[group.key]) ? groups[group.key] : [];
          return {
            ...group,
            items: items.map((item) => ({
              ...item,
              typeLabel: typeLabels[item.recordType] || item.recordType,
              originalDateText: dateOnly(item.originalDate),
              deletedAtText: formatDeletedAt(item.deletedAt),
              retentionText: retentionText(item.daysRemaining),
            })),
          };
        });
        const empty = sections.every((section) => section.items.length === 0);
        this.setData({ sections, empty });
      })
      .catch((err) => {
        const msg = err?.error || "获取回收站失败";
        wx.showToast({ title: msg, icon: "none" });
      })
      .finally(() => this.setData({ loading: false }));
  },

  restoreRecord(e) {
    const { type, id } = e.currentTarget.dataset || {};
    if (!type || !id) return;
    wx.showModal({
      title: "恢复记录",
      content: "确定恢复这条记录吗？",
      success: (res) => {
        if (!res.confirm) return;
        request({
          url: `/students/${this.studentId}/bin/restore`,
          method: "POST",
          data: { recordType: type, recordId: id },
        })
          .then(() => {
            wx.showToast({ title: "已恢复", icon: "success" });
            this.fetchBin();
          })
          .catch((err) => {
            const msg = err?.details || err?.error || "恢复失败";
            wx.showToast({ title: msg, icon: "none" });
          });
      },
    });
  },

  permanentDelete(e) {
    const { type, id } = e.currentTarget.dataset || {};
    if (!type || !id) return;
    wx.showModal({
      title: "彻底删除",
      content: "彻底删除后无法恢复，确定继续吗？",
      confirmColor: "#dc2626",
      success: (res) => {
        if (!res.confirm) return;
        request({
          url: `/students/${this.studentId}/bin/permanent`,
          method: "DELETE",
          data: { recordType: type, recordId: id },
        })
          .then(() => {
            wx.showToast({ title: "已彻底删除", icon: "success" });
            this.fetchBin();
          })
          .catch((err) => {
            const msg = err?.details || err?.error || "删除失败";
            wx.showToast({ title: msg, icon: "none" });
          });
      },
    });
  },
});
